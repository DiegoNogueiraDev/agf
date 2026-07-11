/*!
 * TDD: agf claims --sweep (node_ed64bbd3ba6c).
 *
 * AC: Given 2 expired leases, when agf claims --sweep runs,
 *     then data.swept == 2.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { LockManager } from '../core/store/lock-manager.js'
import { sweepExpiredClaims } from '../core/store/lock-manager.js'

function makeDb() {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS resource_locks (
      resource_id TEXT PRIMARY KEY,
      resource_type TEXT NOT NULL DEFAULT 'task',
      agent_id TEXT NOT NULL,
      lease_token TEXT NOT NULL UNIQUE,
      acquired_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `)
  return db
}

describe('sweepExpiredClaims (agf claims --sweep)', () => {
  it('sweeps 2 expired leases and returns count=2', () => {
    const db = makeDb()
    const lm = new LockManager(db)

    // Acquire 2 leases then manually expire them
    lm.acquire('task_sweep_1', 'agent-A', 1)
    lm.acquire('task_sweep_2', 'agent-B', 1)

    // Expire them in the DB directly (set expires_at to past)
    const past = new Date(Date.now() - 10_000).toISOString()
    db.prepare('UPDATE resource_locks SET expires_at = ?').run(past)

    const swept = sweepExpiredClaims(db)
    expect(swept).toBe(2)
  })

  it('returns 0 when no leases are expired', () => {
    const db = makeDb()
    const lm = new LockManager(db)
    lm.acquire('task_fresh', 'agent-A', 300)

    const swept = sweepExpiredClaims(db)
    expect(swept).toBe(0)
  })

  it('returns 0 when table is empty', () => {
    const db = makeDb()
    const swept = sweepExpiredClaims(db)
    expect(swept).toBe(0)
  })
})
