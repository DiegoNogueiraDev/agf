/*!
 * Task node_2b33740765ab — stale claims self-expire and are swept.
 *
 * AC1: Given a claim with expiresAt in the past, when agf next runs,
 *      then the lease is swept and the task is pullable again.
 * AC2: Given agf swarm sweep, when run, then returns count of swept leases.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { LockManager } from '../core/store/lock-manager.js'
import { sweepStaleLeases } from '../core/planner/sweep-stale-leases.js'

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

describe('sweepStaleLeases', () => {
  it('removes expired leases and returns count (AC2)', () => {
    const db = makeDb()
    const past = new Date(Date.now() - 10_000).toISOString()
    // Insert an already-expired lease directly
    db.prepare(
      `INSERT INTO resource_locks (resource_id, resource_type, agent_id, lease_token, acquired_at, expires_at)
       VALUES (?, 'task', 'agent-x', 'token-1', ?, ?)`,
    ).run('task_expired', past, past)

    const count = sweepStaleLeases(db)
    expect(count).toBe(1)
    const row = db.prepare('SELECT * FROM resource_locks WHERE resource_id = ?').get('task_expired')
    expect(row).toBeUndefined()
  })

  it('does not sweep active leases (AC1)', () => {
    const db = makeDb()
    const lm = new LockManager(db)
    lm.acquire('task_active', 'agent-y', 300)
    const count = sweepStaleLeases(db)
    expect(count).toBe(0)
    const row = db.prepare('SELECT * FROM resource_locks WHERE resource_id = ?').get('task_active')
    expect(row).toBeDefined()
  })

  it('returns 0 when no leases exist', () => {
    const db = makeDb()
    expect(sweepStaleLeases(db)).toBe(0)
  })
})
