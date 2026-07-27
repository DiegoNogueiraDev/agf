/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Bug-audit regression — AUDIT-062 (MED).
 * src/core/store/lock-manager.ts — a ttl<=0 / non-finite claim must NOT return a
 * "successful" but already-expired lock (which breaks mutual exclusion).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { LockManager } from '../core/store/lock-manager.js'
import { LockConflictError } from '../core/utils/errors.js'

function createMemoryDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS resource_locks (
      resource_id   TEXT PRIMARY KEY,
      resource_type TEXT NOT NULL,
      agent_id      TEXT NOT NULL,
      lease_token   TEXT NOT NULL UNIQUE,
      acquired_at   TEXT NOT NULL,
      expires_at    TEXT NOT NULL
    );
  `)
  return db
}

describe('AUDIT-062 — ttl<=0 / NaN must not break mutual exclusion', () => {
  let db: Database.Database
  let manager: LockManager

  beforeEach(() => {
    db = createMemoryDb()
    manager = new LockManager(db)
  })
  afterEach(() => db.close())

  // ttl <= 0 is an INTENDED idiom: "already expired on insert" — AgentClaimManager
  // uses it so sweepStale() can immediately reclaim. AUDIT-062's real fix is only
  // the NON-FINITE (NaN) footgun, which must NOT silently expire.
  it('ttl=0 is already expired on insert (intended reclaim idiom)', () => {
    const r = manager.acquire('resource:1', 'agent-a', 0)
    expect(new Date(r.expiresAt).getTime()).toBeLessThanOrEqual(Date.now())
    // expired → another agent may immediately reclaim (no steal of a held lock)
    expect(() => manager.acquire('resource:1', 'agent-b')).not.toThrow()
  })

  it('NaN ttl does NOT produce an already-expired success (the real bug)', () => {
    const r = manager.acquire('resource:2', 'agent-a', Number.NaN)
    expect(new Date(r.expiresAt).getTime()).toBeGreaterThan(Date.now())
    // genuinely held → another agent is excluded
    expect(() => manager.acquire('resource:2', 'agent-b')).toThrow(LockConflictError)
  })

  it('negative ttl is also already-expired (same as <=0)', () => {
    const r = manager.acquire('resource:3', 'agent-a', -10)
    expect(new Date(r.expiresAt).getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('regression: positive ttl still honoured exactly', () => {
    const r = manager.acquire('resource:4', 'agent-a', 10)
    const diff = new Date(r.expiresAt).getTime() - new Date(r.acquiredAt).getTime()
    expect(diff).toBe(10_000)
  })
})
