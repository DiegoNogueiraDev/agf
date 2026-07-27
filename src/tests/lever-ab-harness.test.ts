/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * Tests for runLeverAb (node_4c77b1d25c92, épico node_66df2059d21e).
 *
 * PORQUÊ: o A/B existente mede UM lever (cascade). Um smart-default que liga
 * levers "com evidência" ficaria restrito a 1 de N — a armadilha measure→activate.
 * Este harness roda CADA lever ON vs OFF e emite um veredito por lever.
 *
 * Zero mock: Database(':memory:') real + o ledger real; o executor é injetado
 * (DIP) e devolve uso determinístico — é o "provider stub" que a própria task
 * sanciona, não um dublê do módulo sob teste.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { runLeverAb, type LeverAbExecutor } from '../core/economy/lever-ab-harness.js'
import type { LeverKey } from '../core/economy/economy-levers-config.js'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
})

const LEVERS: LeverKey[] = ['ncd_dedup', 'forage_stop']
const TASKS = ['t1', 't2']

/**
 * Executor determinístico: `savingByLever` diz quantos tokens o braço ON poupa
 * (negativo = o lever custa mais). Cost é derivado dos tokens.
 */
function makeExecutor(savingByLever: Partial<Record<LeverKey, number>>, available = true): LeverAbExecutor {
  return {
    available: () => available,
    runArm: async (lever, arm) => {
      const base = 1000
      const saving = savingByLever[lever] ?? 0
      const tokens = arm === 'off' ? base : base - saving
      return {
        inputTokens: tokens,
        outputTokens: 0,
        costUsd: tokens / 1000,
        provider: 'stub',
        model: 'stub-model',
        modelTier: 'cheap',
      }
    },
  }
}

describe('runLeverAb — set coverage (every lever gets evidence)', () => {
  it('produces one verdict per lever, not just the flagship', async () => {
    const out = await runLeverAb(db, makeExecutor({ ncd_dedup: 300, forage_stop: 100 }), LEVERS, TASKS, {
      sessionId: 's1',
    })
    expect(out.mode).toBe('live')
    if (out.mode !== 'live') return
    expect(out.verdicts.map((v) => v.lever).sort()).toEqual(['forage_stop', 'ncd_dedup'])
  })

  it('a lever that saves tokens is recommended ON', async () => {
    const out = await runLeverAb(db, makeExecutor({ ncd_dedup: 300 }), ['ncd_dedup'], TASKS, { sessionId: 's1' })
    if (out.mode !== 'live') throw new Error('expected live')
    const v = out.verdicts[0]
    expect(v.savedTokens).toBe(600) // 300 por task × 2 tasks
    expect(v.recommendation).toBe('enable')
  })

  it('a lever whose A/B is NEGATIVE is recommended to stay OFF (disprove counts)', async () => {
    const out = await runLeverAb(db, makeExecutor({ forage_stop: -250 }), ['forage_stop'], TASKS, { sessionId: 's1' })
    if (out.mode !== 'live') throw new Error('expected live')
    const v = out.verdicts[0]
    expect(v.savedTokens).toBe(-500)
    expect(v.recommendation).toBe('keep-off')
  })

  it('provider unavailable → mode delegated with a reason, never a silent zero', async () => {
    const out = await runLeverAb(db, makeExecutor({}, false), LEVERS, TASKS, { sessionId: 's1' })
    expect(out.mode).toBe('delegated')
    if (out.mode !== 'delegated') return
    expect(out.reason.length).toBeGreaterThan(0)
  })

  it('empty task-set throws an actionable error (never resolves with a silent 0)', async () => {
    await expect(runLeverAb(db, makeExecutor({}), LEVERS, [], { sessionId: 's1' })).rejects.toThrow(/task-set/i)
  })

  it('empty lever list throws an actionable error', async () => {
    await expect(runLeverAb(db, makeExecutor({}), [], TASKS, { sessionId: 's1' })).rejects.toThrow(/lever/i)
  })
})

describe('runLeverAb — instrument fidelity (the counter must actually move)', () => {
  it('a KNOWN saving lands in economy_lever_ledger for that lever', async () => {
    await runLeverAb(db, makeExecutor({ ncd_dedup: 300 }), ['ncd_dedup'], TASKS, { sessionId: 's1' })
    const row = db
      .prepare(`SELECT COUNT(*) AS n, SUM(saved) AS saved FROM economy_lever_ledger WHERE lever = 'ncd_dedup'`)
      .get() as { n: number; saved: number }
    expect(row.n).toBe(2) // uma linha por task
    expect(row.saved).toBe(600) // o custo conhecido injetado aparece no ledger
  })

  it('a KNOWN cost lands in llm_call_ledger (two calls per task — one per arm)', async () => {
    await runLeverAb(db, makeExecutor({ ncd_dedup: 300 }), ['ncd_dedup'], TASKS, { sessionId: 's1' })
    const row = db.prepare(`SELECT COUNT(*) AS n FROM llm_call_ledger WHERE session_id = 's1'`).get() as { n: number }
    expect(row.n).toBe(4) // 2 tasks × 2 braços
  })

  it('ledger rows stay separated per lever (no cross-contamination)', async () => {
    await runLeverAb(db, makeExecutor({ ncd_dedup: 300, forage_stop: 100 }), LEVERS, TASKS, { sessionId: 's1' })
    const ncd = db.prepare(`SELECT SUM(saved) AS saved FROM economy_lever_ledger WHERE lever = 'ncd_dedup'`).get() as {
      saved: number
    }
    const forage = db
      .prepare(`SELECT SUM(saved) AS saved FROM economy_lever_ledger WHERE lever = 'forage_stop'`)
      .get() as { saved: number }
    expect(ncd.saved).toBe(600)
    expect(forage.saved).toBe(200)
  })
})
