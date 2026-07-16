/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations.js'
import { configureDb } from '../core/store/migrations.js'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

function getColumns(db: Database.Database, table: string): Array<{ name: string; type: string }> {
  return db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; type: string }>
}

function getIndexes(db: Database.Database): Array<{ name: string; sql: string | null }> {
  return db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='economy_lever_ledger'")
    .all() as Array<{ name: string; sql: string | null }>
}

describe('economy_lever_ledger migration (v99)', () => {
  let db: Database.Database

  beforeAll(() => {
    db = createTestDb()
  })

  it('cria tabela economy_lever_ledger', () => {
    const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='economy_lever_ledger'").get()
    expect(table).toBeTruthy()
  })

  it('tabela tem as 13 colunas corretas (incl. score da v111, baseline_method da v125, surface da v126)', () => {
    const cols = getColumns(db, 'economy_lever_ledger')
    const names = cols.map((c) => c.name)
    expect(names).toContain('id')
    expect(names).toContain('ts')
    expect(names).toContain('session_id')
    expect(names).toContain('node_id')
    expect(names).toContain('lever')
    expect(names).toContain('tokens_before')
    expect(names).toContain('tokens_after')
    expect(names).toContain('saved')
    expect(names).toContain('accepted')
    expect(names).toContain('gate_outcome')
    expect(names).toContain('score') // v111 — gate confidence for calibration
    // v125 — a saving is only evidence if the row names the counterfactual it was measured
    // against. NULL on a legacy row reads as `structural`, the constant it in fact used.
    expect(names).toContain('baseline_method')
    // v126 — efeito-no-driver: a saving nomeia a superficie onde disparou (F2.T2);
    // NULL = linha pre-migracao apenas (toda escrita nova classifica, enforced no tipo).
    expect(names).toContain('surface')
    expect(cols.length).toBe(13)
  })

  it('score é REAL nullable (v111)', () => {
    const col = getColumns(db, 'economy_lever_ledger').find((c) => c.name === 'score')
    expect(col?.type).toBe('REAL')
    db.prepare(
      `INSERT INTO economy_lever_ledger (id, ts, session_id, lever, tokens_before, tokens_after, saved, accepted, gate_outcome, score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('test-score-1', 3000, 'session-1', 'rag_in_reuse', 66, 6, 60, 1, 'accepted', 0.82)
    const row = db.prepare('SELECT score FROM economy_lever_ledger WHERE id = ?').get('test-score-1') as {
      score: number
    }
    expect(row.score).toBeCloseTo(0.82)
  })

  it('id é TEXT PK', () => {
    const col = getColumns(db, 'economy_lever_ledger').find((c) => c.name === 'id')
    expect(col?.type).toBe('TEXT')
  })

  it('saved é INTEGER', () => {
    const col = getColumns(db, 'economy_lever_ledger').find((c) => c.name === 'saved')
    expect(col?.type).toBe('INTEGER')
  })

  it('cria índices (session_id) e (lever, ts)', () => {
    const indexes = getIndexes(db)
    const names = indexes.map((i) => i.name)
    expect(names).toContain('idx_lev_ledger_session')
    expect(names).toContain('idx_lev_ledger_lever_ts')
  })

  it('migration é idempotente (roda 2x sem erro)', () => {
    expect(() => runMigrations(db)).not.toThrow()
  })

  it('INSERT e SELECT funcionam', () => {
    const insert = db.prepare(`
      INSERT INTO economy_lever_ledger (id, ts, session_id, node_id, lever, tokens_before, tokens_after, saved, accepted, gate_outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insert.run('test-uuid-1', 1000, 'session-1', null, 'compress', 500, 300, 200, 1, 'accepted')

    const row = db.prepare('SELECT * FROM economy_lever_ledger WHERE id = ?').get('test-uuid-1') as Record<
      string,
      unknown
    >
    expect(row).toBeTruthy()
    expect(row.lever).toBe('compress')
    expect(row.saved).toBe(200)
    expect(row.accepted).toBe(1)
  })

  it('node_id pode ser NULL', () => {
    const insert = db.prepare(`
      INSERT INTO economy_lever_ledger (id, ts, session_id, lever, tokens_before, tokens_after, saved, accepted, gate_outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    insert.run('test-uuid-2', 2000, 'session-1', 'caveman', 100, 40, 60, 0, 'reverted')

    const row = db.prepare('SELECT * FROM economy_lever_ledger WHERE id = ?').get('test-uuid-2') as Record<
      string,
      unknown
    >
    expect(row.node_id).toBeNull()
    expect(row.gate_outcome).toBe('reverted')
  })
})
