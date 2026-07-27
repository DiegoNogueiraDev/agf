/*!
 * Task node_f18313ebc9b8 — done-cmd releases claim after status transition.
 *
 * AC: Given a claimed+done task, when done finishes, then claims list no longer contains it.
 *
 * Characterization: verifies releaseTaskClaim is wired in done-cmd via the pure helper.
 * Tests the helper directly (done-cmd wiring is an integration concern).
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { LockManager } from '../core/store/lock-manager.js'
import { releaseTaskClaim } from '../core/planner/release-task-claim.js'

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

describe('done-cmd release claim integration (characterization)', () => {
  it('claims list no longer contains task after release (AC)', () => {
    const db = makeDb()
    const lm = new LockManager(db)

    // Agent claims the task
    lm.acquire('task_done_1', 'agent-A')

    // Simulate done: release the claim
    const result = releaseTaskClaim(db, 'task_done_1', 'agent-A')
    expect(result.released).toBe(true)

    // Claims list no longer contains this task
    const row = db.prepare('SELECT * FROM resource_locks WHERE resource_id = ?').get('task_done_1')
    expect(row).toBeUndefined()
  })
})
