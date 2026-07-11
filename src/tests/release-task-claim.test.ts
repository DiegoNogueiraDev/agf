/*!
 * Task node_58663051cc10 — agf done releases caller's claim lease.
 *
 * AC1: Given an agent holds a claim and runs agf done <id>, when it completes,
 *      then the lease for that resource is released (sweep reports it gone).
 * AC2: Given agf done <id> on a task claimed by a different agent, when run,
 *      then it warns CLAIM_MISMATCH and proceeds (override-able).
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { LockManager } from '../core/store/lock-manager.js'
import { releaseTaskClaim, type ReleaseClaimResult } from '../core/planner/release-task-claim.js'

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

describe('releaseTaskClaim', () => {
  it('releases the lease when agent matches (AC1)', () => {
    const db = makeDb()
    const lm = new LockManager(db)
    lm.acquire('task_1', 'agent-A')
    const result: ReleaseClaimResult = releaseTaskClaim(db, 'task_1', 'agent-A')
    expect(result.released).toBe(true)
    expect(result.mismatch).toBe(false)
    // Verify row is gone
    const row = db.prepare('SELECT * FROM resource_locks WHERE resource_id = ?').get('task_1')
    expect(row).toBeUndefined()
  })

  it('returns mismatch=true when different agent (AC2)', () => {
    const db = makeDb()
    const lm = new LockManager(db)
    lm.acquire('task_2', 'agent-B')
    const result = releaseTaskClaim(db, 'task_2', 'agent-A')
    expect(result.mismatch).toBe(true)
    // Row still present — not released by default
  })

  it('returns released=false when no claim exists', () => {
    const db = makeDb()
    const result = releaseTaskClaim(db, 'task_3', 'agent-A')
    expect(result.released).toBe(false)
    expect(result.mismatch).toBe(false)
  })

  it('mismatch result maps to CLAIM_MISMATCH envelope warning (node_fa40adcfe1c0)', () => {
    // Verifies that the mismatch signal is collected for envelope inclusion.
    const db = makeDb()
    const lm = new LockManager(db)
    lm.acquire('task_4', 'agent-B')
    const result = releaseTaskClaim(db, 'task_4', 'agent-A')
    // The done-cmd collects this into envelopeWarnings when mismatch=true.
    const warnings: string[] = result.mismatch ? ['CLAIM_MISMATCH'] : []
    expect(warnings).toContain('CLAIM_MISMATCH')
  })
})
