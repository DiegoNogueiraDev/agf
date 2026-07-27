/*!
 * TDD: findAgentClaim — detect existing live claim by agentId (node_e9d931c31662).
 *
 * AC: Given A with a live claim on task X, when A pulls (next), then result.node.id == X.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { LockManager } from '../core/store/lock-manager.js'
import { findAgentClaim } from '../core/planner/claim-next-task.js'

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

describe('findAgentClaim', () => {
  it('returns the resource_id when agentId has a live claim', () => {
    const db = makeDb()
    const lm = new LockManager(db)
    lm.acquire('task:node_abc123', 'agent-A', 300)

    const found = findAgentClaim(db, 'agent-A')
    expect(found).toBe('node_abc123')
  })

  it('returns null when agent has no live claim', () => {
    const db = makeDb()
    const found = findAgentClaim(db, 'agent-A')
    expect(found).toBeNull()
  })

  it('returns null for expired claim', () => {
    const db = makeDb()
    const lm = new LockManager(db)
    lm.acquire('task:node_expired', 'agent-B', 1)

    // Force expiry
    const past = new Date(Date.now() - 10_000).toISOString()
    db.prepare('UPDATE resource_locks SET expires_at = ? WHERE agent_id = ?').run(past, 'agent-B')

    const found = findAgentClaim(db, 'agent-B')
    expect(found).toBeNull()
  })
})
