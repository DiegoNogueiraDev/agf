/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * 167 rows in `economy_lever_ledger`, `node_id` NULL on every one. So `agf savings` reported 6,991
 * tokens with no way to say which task earned them — and no way to tell a benchmark from a day of
 * work. Sixty-three percent of that total was one afternoon of probing the retriever.
 *
 * `toLeverEvent(e, sessionId, nodeId?)` had taken a node id from the day it was written. Nobody
 * ever passed one.
 *
 * The graph already knows which task is being worked: WIP=1 is the project's own invariant, so at
 * most one node is `in_progress`. When there is one, the saving belongs to it. When there is none,
 * nothing was being worked and the saving is untracked — which is exactly what a benchmark is.
 * Ambiguity is not resolved by guessing: two in-progress nodes attribute to neither.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  baselineMethodMix,
  currentTaskId,
  savingsBySession,
  summarizeAttribution,
  ingestConductorUsage,
  envConductorUsageSource,
  savingsBySurface,
  burnRate,
} from '../core/economy/attribution.js'
import { runMigrations } from '../core/store/migrations/index.js'
import { recordLeverEvent } from '../core/economy/economy-lever-ledger.js'
import { SqliteStore } from '../core/store/sqlite-store.js'

let db: Database.Database

/** Minimal `nodes` shape: `currentTaskId` reads status and archived, nothing else. */
function seed(rows: Array<{ id: string; status: string; archived?: number; type?: string }>): void {
  const insert = db.prepare('INSERT INTO nodes (id, type, status, archived) VALUES (?, ?, ?, ?)')
  for (const row of rows) insert.run(row.id, row.type ?? 'task', row.status, row.archived ?? 0)
}

beforeEach(() => {
  db = new Database(':memory:')
  db.exec('CREATE TABLE nodes (id TEXT PRIMARY KEY, type TEXT, status TEXT, archived INTEGER DEFAULT 0)')
})

afterEach(() => db.close())

describe('currentTaskId — the saving belongs to the task being worked', () => {
  it('returns the single in-progress task', () => {
    seed([
      { id: 'node_a', status: 'backlog' },
      { id: 'node_b', status: 'in_progress' },
      { id: 'node_c', status: 'done' },
    ])
    expect(currentTaskId(db)).toBe('node_b')
  })

  it('returns null when nothing is in progress — an untracked call is a benchmark', () => {
    seed([{ id: 'node_a', status: 'backlog' }])
    expect(currentTaskId(db)).toBeNull()
  })

  // WIP=1 is an invariant, not a guarantee: `--force` and crashed loops both break it. Two
  // candidates means the ledger cannot know which one earned the tokens, and a ledger that
  // guesses is worse than one that abstains.
  it('returns null when the invariant is broken rather than picking one', () => {
    seed([
      { id: 'node_a', status: 'in_progress' },
      { id: 'node_b', status: 'in_progress' },
    ])
    expect(currentTaskId(db)).toBeNull()
  })

  it('ignores an archived node — `node rm` is a soft delete', () => {
    seed([{ id: 'node_a', status: 'in_progress', archived: 1 }])
    expect(currentTaskId(db)).toBeNull()
  })

  it('never throws when the table is missing — telemetry must not break a command', () => {
    const empty = new Database(':memory:')
    expect(() => currentTaskId(empty)).not.toThrow()
    expect(currentTaskId(empty)).toBeNull()
    empty.close()
  })
})

/** Minimal ledger shape: only the columns the summary reads. */
function seedLedger(
  rows: Array<{
    nodeId: string | null
    saved: number
    baselineMethod?: string | null
    lever?: string
    sessionId?: string
  }>,
): void {
  db.exec(`CREATE TABLE economy_lever_ledger (
    id TEXT PRIMARY KEY, ts INTEGER, session_id TEXT, node_id TEXT,
    lever TEXT, tokens_before INTEGER, tokens_after INTEGER, saved INTEGER,
    accepted INTEGER, gate_outcome TEXT, baseline_method TEXT)`)
  const insert = db.prepare(
    `INSERT INTO economy_lever_ledger (id, ts, session_id, node_id, lever, tokens_before, tokens_after, saved, accepted, gate_outcome, baseline_method)
     VALUES (?, 0, ?, ?, ?, 0, 0, ?, 1, 'accepted', ?)`,
  )
  rows.forEach((row, i) =>
    insert.run(
      `ev_${i}`,
      row.sessionId ?? 'cli',
      row.nodeId,
      row.lever ?? 'rag_in_reuse',
      row.saved,
      row.baselineMethod ?? null,
    ),
  )
}

describe('summarizeAttribution — a total nobody owns is a total nobody can audit', () => {
  it('splits savings into what a task earned and what nothing did', () => {
    seedLedger([
      { nodeId: 'node_a', saved: 100 },
      { nodeId: 'node_a', saved: 50 },
      { nodeId: 'node_b', saved: 30 },
      { nodeId: null, saved: 900 },
    ])
    const summary = summarizeAttribution(db)

    expect(summary.attributed).toEqual({ events: 3, saved: 180 })
    expect(summary.unattributed).toEqual({ events: 1, saved: 900 })
  })

  it('names the tasks that earned it, largest first', () => {
    seedLedger([
      { nodeId: 'node_small', saved: 10 },
      { nodeId: 'node_big', saved: 400 },
      { nodeId: null, saved: 7 },
    ])
    expect(summarizeAttribution(db).byNode).toEqual([
      { nodeId: 'node_big', events: 1, saved: 400 },
      { nodeId: 'node_small', events: 1, saved: 10 },
    ])
  })

  it('reports zero rather than throwing when no lever ever fired', () => {
    const empty = new Database(':memory:')
    const summary = summarizeAttribution(empty)
    expect(summary.attributed.saved).toBe(0)
    expect(summary.unattributed.saved).toBe(0)
    expect(summary.byNode).toEqual([])
    empty.close()
  })
})

/**
 * `agf savings` used to stamp `baselineMethod: 'structural'` on the whole envelope. It was true
 * when every row was computed against a chosen constant. It stopped being true the moment one row
 * was measured, and a flat label over a mixed ledger is the same failure as an unnamed baseline.
 */
describe('baselineMethodMix — a mixed ledger cannot wear one label', () => {
  it('reports the tokens each baseline accounts for, largest first', () => {
    seedLedger([
      { nodeId: null, saved: 60, baselineMethod: 'structural' },
      { nodeId: null, saved: 457, baselineMethod: 'measured_fallback' },
      { nodeId: null, saved: 457, baselineMethod: 'measured_fallback' },
    ])
    expect(baselineMethodMix(db)).toEqual([
      { baselineMethod: 'measured_fallback', events: 2, saved: 914 },
      { baselineMethod: 'structural', events: 1, saved: 60 },
    ])
  })

  it('reads a row written before the column existed as the constant it used', () => {
    seedLedger([{ nodeId: null, saved: 60, baselineMethod: null }])
    expect(baselineMethodMix(db)).toEqual([{ baselineMethod: 'structural', events: 1, saved: 60 }])
  })

  it('returns nothing rather than throwing when no lever ever fired', () => {
    const empty = new Database(':memory:')
    expect(baselineMethodMix(empty)).toEqual([])
    empty.close()
  })
})

/**
 * Excluding `scaffold_recovery` from `totalSaved` and leaving it inside the attribution split
 * would have been the same failure one layer down: a headline that adds up and a breakdown beneath
 * it that does not. Both read the same ledger; both count only tokens.
 */
describe('token-only accounting — the breakdown adds up to the headline', () => {
  it('leaves a cost-unit lever out of the attribution split', () => {
    seedLedger([
      { nodeId: 'node_a', saved: 159, lever: 'rag_out_recovery' },
      { nodeId: 'node_a', saved: 239, lever: 'scaffold_recovery' },
      { nodeId: null, saved: 60, lever: 'rag_in_reuse' },
    ])
    const summary = summarizeAttribution(db)

    expect(summary.attributed).toEqual({ events: 1, saved: 159 })
    expect(summary.unattributed).toEqual({ events: 1, saved: 60 })
    expect(summary.byNode).toEqual([{ nodeId: 'node_a', events: 1, saved: 159 }])
  })

  it('leaves it out of the baseline mix as well', () => {
    seedLedger([
      { nodeId: null, saved: 159, lever: 'rag_out_recovery', baselineMethod: 'measured_template' },
      { nodeId: null, saved: 239, lever: 'scaffold_recovery', baselineMethod: null },
    ])
    expect(baselineMethodMix(db)).toEqual([{ baselineMethod: 'measured_template', events: 1, saved: 159 }])
  })
})

/**
 * "How much did this sitting save?" is the question an agent asks when it finishes, and the ledger
 * could not answer it: `session_id` was `'cli'` on every row. Grouping by a constant returns one
 * bucket, which is the same as not grouping.
 */
describe('savingsBySession — what this sitting of work earned', () => {
  it('groups the tokens by the session that earned them, largest first', () => {
    seedLedger([
      { nodeId: null, saved: 60, sessionId: 'sess_aaa' },
      { nodeId: null, saved: 457, sessionId: 'sess_aaa' },
      { nodeId: null, saved: 159, sessionId: 'sess_bbb' },
    ])
    expect(savingsBySession(db)).toEqual([
      { sessionId: 'sess_aaa', events: 2, saved: 517 },
      { sessionId: 'sess_bbb', events: 1, saved: 159 },
    ])
  })

  it('leaves the cost-unit lever out here too', () => {
    seedLedger([
      { nodeId: null, saved: 159, sessionId: 'sess_aaa', lever: 'rag_out_recovery' },
      { nodeId: null, saved: 239, sessionId: 'sess_aaa', lever: 'scaffold_recovery' },
    ])
    expect(savingsBySession(db)).toEqual([{ sessionId: 'sess_aaa', events: 1, saved: 159 }])
  })

  it('returns nothing rather than throwing on an empty ledger', () => {
    const empty = new Database(':memory:')
    expect(savingsBySession(empty)).toEqual([])
    empty.close()
  })
})

describe('ingestConductorUsage — fail-open capture of the conductor real usage (node_a5391263cf80)', () => {
  let store: SqliteStore
  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('ingest-test')
  })
  afterEach(() => store.close())

  function ledgerCount(): number {
    return (store.getDb().prepare('SELECT COUNT(*) AS c FROM llm_call_ledger').get() as { c: number }).c
  }

  it('AC1: an absent source is a no-op → mode:unavailable, no ledger row, no throw', () => {
    const before = ledgerCount()
    const r = ingestConductorUsage(store.getDb(), () => null)
    expect(r.mode).toBe('unavailable')
    expect(r.recorded).toBe(0)
    expect(ledgerCount()).toBe(before)
  })

  it('AC1: a throwing source is also fail-open (unavailable, never throws)', () => {
    expect(() =>
      ingestConductorUsage(store.getDb(), () => {
        throw new Error('boom')
      }),
    ).not.toThrow()
    const r = ingestConductorUsage(store.getDb(), () => {
      throw new Error('boom')
    })
    expect(r.mode).toBe('unavailable')
  })

  it('AC2: a present source with N tokens records one ledger row keyed by session_id', () => {
    const r = ingestConductorUsage(store.getDb(), () => ({
      sessionId: 'sess-x',
      nodeId: 'node_z',
      tokensIn: 300,
      tokensOut: 120,
      model: 'ext-model',
    }))
    expect(r.mode).toBe('ingested')
    expect(r.recorded).toBe(1)
    const row = store
      .getDb()
      .prepare(
        "SELECT session_id AS s, input_tokens AS i, output_tokens AS o, node_id AS n FROM llm_call_ledger WHERE session_id = 'sess-x'",
      )
      .get() as { s: string; i: number; o: number; n: string } | undefined
    expect(row).toBeDefined()
    expect(row?.s).toBe('sess-x')
    expect(row?.i).toBe(300)
    expect(row?.o).toBe(120)
    expect(row?.n).toBe('node_z')
  })

  it('envConductorUsageSource: no AGF_CONDUCTOR_USAGE_FILE → null (default fail-open)', () => {
    expect(envConductorUsageSource({})()).toBeNull()
  })
})

describe('savingsBySurface (F2.T4 node_44a25be0becd)', () => {
  function migratedDb(): Database.Database {
    const mdb = new Database(':memory:')
    runMigrations(mdb)
    return mdb
  }

  it('agrega por superficie e a soma das partes e igual ao total', () => {
    const mdb = migratedDb()
    // Arrange — 3 superficies distintas
    recordLeverEvent(mdb, {
      sessionId: 'sf1',
      lever: 'exec_compress',
      tokensBefore: 100,
      tokensAfter: 60,
      saved: 40,
      accepted: true,
      gateOutcome: 'accepted',
      surface: 'hook',
    })
    recordLeverEvent(mdb, {
      sessionId: 'sf1',
      lever: 'flow',
      tokensBefore: 50,
      tokensAfter: 30,
      saved: 20,
      accepted: true,
      gateOutcome: 'accepted',
      surface: 'context',
    })
    recordLeverEvent(mdb, {
      sessionId: 'sf1',
      lever: 'rag_in_reuse',
      tokensBefore: 30,
      tokensAfter: 20,
      saved: 10,
      accepted: true,
      gateOutcome: 'accepted',
      surface: 'envelope',
    })

    // Act
    const s = savingsBySurface(mdb)

    // Assert
    expect(s.hook).toBe(40)
    expect(s.context).toBe(20)
    expect(s.envelope).toBe(10)
    expect(s.hook + s.context + s.brief + s.envelope + s.internal + s.unknown).toBe(s.total)
    mdb.close()
  })

  it('linhas antigas com surface NULL caem na categoria unknown sem erro', () => {
    const mdb = migratedDb()
    // Arrange — linha pre-migracao
    mdb
      .prepare(
        `INSERT INTO economy_lever_ledger
        (id, ts, session_id, node_id, lever, tokens_before, tokens_after, saved, accepted, gate_outcome, score, baseline_method)
       VALUES ('legacy-sf', 2, 'sf0', NULL, 'heat_kernel', 10, 5, 5, 1, 'accepted', NULL, NULL)`,
      )
      .run()

    // Act
    const s = savingsBySurface(mdb)

    // Assert
    expect(s.unknown).toBeGreaterThanOrEqual(5)
    expect(s.total).toBeGreaterThanOrEqual(5)
    mdb.close()
  })

  it('ledger vazio retorna todas as categorias zeradas', () => {
    const fresh = new Database(':memory:')
    runMigrations(fresh)
    const s = savingsBySurface(fresh)
    expect(s.total).toBe(0)
    expect(s.hook + s.context + s.brief + s.envelope + s.internal + s.unknown).toBe(0)
    fresh.close()
  })
})

describe('burnRate — tokens/min da sessao em janela deslizante (E3.T1 node_07baf4de251b)', () => {
  function llmDb(): Database.Database {
    const mdb = new Database(':memory:')
    runMigrations(mdb)
    return mdb
  }

  function seedCall(
    mdb: Database.Database,
    id: string,
    session: string,
    ts: number,
    tokensIn: number,
    tokensOut: number,
  ): void {
    mdb
      .prepare(
        `INSERT INTO llm_call_ledger (id, ts, session_id, provider, model, input_tokens, output_tokens, cost_usd, status)
         VALUES (?, ?, ?, 'stub', 'stub-model', ?, ?, 0, 'ok')`,
      )
      .run(id, ts, session, tokensIn, tokensOut)
  }

  it('10 chamadas somando 1000 tokens em 5 min com janela de 5 min retornam exatamente 200 tokens/min', () => {
    // Arrange — 10 chamadas de 60+40=100 tokens dentro da janela
    const mdb = llmDb()
    const now = 1_000_000_000
    const windowMs = 5 * 60_000
    for (let i = 0; i < 10; i += 1) {
      seedCall(mdb, `c${i}`, 'sess-1', now - i * 20_000, 60, 40)
    }

    // Act
    const rate = burnRate(mdb, 'sess-1', windowMs, now)

    // Assert — 1000 tokens / 5 min
    expect(rate).toBe(200)
    mdb.close()
  })

  it('janela sem chamadas retorna 0 sem excecao', () => {
    const mdb = llmDb()
    expect(burnRate(mdb, 'sess-vazia', 5 * 60_000, 1_000_000_000)).toBe(0)
    mdb.close()
  })

  it('tabela ausente (db pre-migracao) retorna 0 sem excecao', () => {
    const bare = new Database(':memory:')
    expect(burnRate(bare, 's', 60_000, 1_000)).toBe(0)
    bare.close()
  })

  it('chamadas fora da janela deslizante e de outras sessoes sao excluidas', () => {
    // Arrange — 1 dentro, 1 velha demais, 1 de outra sessao
    const mdb = llmDb()
    const now = 1_000_000_000
    const windowMs = 5 * 60_000
    seedCall(mdb, 'in', 'sess-1', now - 60_000, 100, 0)
    seedCall(mdb, 'old', 'sess-1', now - windowMs - 1, 900, 0)
    seedCall(mdb, 'other', 'sess-2', now - 60_000, 500, 0)

    // Act
    const rate = burnRate(mdb, 'sess-1', windowMs, now)

    // Assert — so os 100 tokens da chamada dentro da janela: 100/5 = 20
    expect(rate).toBe(20)
    mdb.close()
  })
})
