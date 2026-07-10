/*!
 * TDD: agf claims — visibility command listing active leases (node_b7d9f5c65685).
 *
 * AC1: Given 2 active claims, agf claims lists each with resourceId, agentId, expiresAt.
 * AC2: Output honors JSON envelope contract (ok, data, meta.command).
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { LockManager } from '../core/store/lock-manager.js'
import { listActiveClaims } from '../core/store/lock-manager.js'

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

describe('AC1: listActiveClaims returns active leases with required fields', () => {
  it('returns 2 rows when 2 active claims exist', () => {
    const db = makeDb()
    const lm = new LockManager(db)
    lm.acquire('task-A', 'agent-1', 300)
    lm.acquire('task-B', 'agent-2', 300)

    const claims = listActiveClaims(db)
    expect(claims).toHaveLength(2)
    const ids = claims.map((c) => c.resourceId).sort()
    expect(ids).toEqual(['task-A', 'task-B'])
    // Each row must have the required fields
    for (const c of claims) {
      expect(c).toHaveProperty('resourceId')
      expect(c).toHaveProperty('agentId')
      expect(c).toHaveProperty('expiresAt')
    }
  })

  it('returns empty array when no active claims', () => {
    const db = makeDb()
    expect(listActiveClaims(db)).toHaveLength(0)
  })

  it('excludes expired leases', () => {
    const db = makeDb()
    const lm = new LockManager(db)
    lm.acquire('task-live', 'agent-A', 300)
    // Insert expired lease directly
    const past = new Date(Date.now() - 5_000).toISOString()
    db.prepare(
      `INSERT INTO resource_locks (resource_id, resource_type, agent_id, lease_token, acquired_at, expires_at)
       VALUES (?, 'task', 'agent-B', 'tok-exp', ?, ?)`,
    ).run('task-expired', past, past)

    const claims = listActiveClaims(db)
    expect(claims).toHaveLength(1)
    expect(claims[0]!.resourceId).toBe('task-live')
  })
})
