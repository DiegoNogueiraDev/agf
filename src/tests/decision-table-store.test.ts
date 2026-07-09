/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { DecisionTableStore } from '../core/learning/decision-table-store.js'

function tableExists(db: Database.Database, name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) as
    { name: string } | undefined
  return row?.name === name
}

describe('DecisionTableStore', () => {
  // AC1: GIVEN a migration run WHEN the store opens THEN compiled_decisions exists and is idempotent on re-run
  it('creates the compiled_decisions table on open and is idempotent across re-instantiation', () => {
    const db = new Database(':memory:')
    new DecisionTableStore(db)
    expect(tableExists(db, 'compiled_decisions')).toBe(true)

    // Re-run (a second store over the same db) must not throw.
    expect(() => new DecisionTableStore(db)).not.toThrow()
    expect(tableExists(db, 'compiled_decisions')).toBe(true)
  })

  // AC2: GIVEN a compiled rule put twice WHEN read THEN one row with occurrences updated (upsert)
  it('upserts on duplicate key — one row, occurrences incremented, latest values kept', () => {
    const db = new Database(':memory:')
    const store = new DecisionTableStore(db)
    const key = 'k_domainA_build_implementer_abc123'

    store.put({ key, decision: { model: 'haiku' }, successRate: 0.8, compiledAt: 1000 })
    store.put({ key, decision: { model: 'sonnet' }, successRate: 0.9, compiledAt: 2000 })

    const count = (db.prepare('SELECT COUNT(*) AS n FROM compiled_decisions').get() as { n: number }).n
    expect(count).toBe(1)

    const row = store.get(key)
    expect(row).not.toBeNull()
    expect(row?.occurrences).toBe(2)
    expect(row?.successRate).toBe(0.9)
    expect(row?.decision).toEqual({ model: 'sonnet' })
  })

  it('get returns null for an unknown key', () => {
    const db = new Database(':memory:')
    const store = new DecisionTableStore(db)
    expect(store.get('missing')).toBeNull()
  })

  it('scopes rows by projectId so the same key in different projects does not collide', () => {
    const db = new Database(':memory:')
    const a = new DecisionTableStore(db, 'projA')
    const b = new DecisionTableStore(db, 'projB')
    a.put({ key: 'shared', decision: { v: 1 }, successRate: 0.7, compiledAt: 1 })
    b.put({ key: 'shared', decision: { v: 2 }, successRate: 0.7, compiledAt: 1 })
    expect(a.get('shared')?.decision).toEqual({ v: 1 })
    expect(b.get('shared')?.decision).toEqual({ v: 2 })
  })
})
