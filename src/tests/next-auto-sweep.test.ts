/*!
 * Task node_5b6bb908d91e — auto-sweep expired leases at start of next-task selection.
 *
 * AC: Given one expired and one live lease, when next runs, then exactly the expired one is swept.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { sweepStaleLeases } from '../core/planner/sweep-stale-leases.js'
import { LockManager } from '../core/store/lock-manager.js'

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

describe('auto-sweep on next (AC)', () => {
  it('sweeps exactly the expired lease, live one remains', () => {
    const db = makeDb()
    const lm = new LockManager(db)

    // Live lease — TTL 300s
    lm.acquire('task_live', 'agent-A', 300)

    // Expired lease — insert directly with past expiresAt
    const past = new Date(Date.now() - 5_000).toISOString()
    db.prepare(
      `INSERT INTO resource_locks (resource_id, resource_type, agent_id, lease_token, acquired_at, expires_at)
       VALUES (?, 'task', 'agent-B', 'token-expired', ?, ?)`,
    ).run('task_expired', past, past)

    // Simulate what next does: sweep first
    const swept = sweepStaleLeases(db)
    expect(swept).toBe(1)

    // Live lease still present
    const live = db.prepare('SELECT * FROM resource_locks WHERE resource_id = ?').get('task_live')
    expect(live).toBeDefined()

    // Expired lease gone
    const expired = db.prepare('SELECT * FROM resource_locks WHERE resource_id = ?').get('task_expired')
    expect(expired).toBeUndefined()
  })
})
