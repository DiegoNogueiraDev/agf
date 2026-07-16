/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_a79ba9cf5631 AC coverage: agent-activity.ts
 *
 * AC1: getAgentActivity returns [] on empty DB or missing tables
 * AC2: derives active/stale from heartbeat timestamp vs 60s threshold
 * AC3: aggregates activeLocks count per agent
 * AC4: extracts currentTaskId from task: resource locks
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { getAgentActivity } from '../core/insights/agent-activity.js'

// ── DB setup ──────────────────────────────────────────────────────────────────

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE event_queue (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      agent_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE resource_locks (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
      agent_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `)
  return db
}

function insertHeartbeat(db: Database.Database, agentId: string, createdAt: string) {
  db.prepare(`INSERT INTO event_queue (agent_id, event_type, created_at) VALUES (?, 'agent:heartbeat', ?)`).run(
    agentId,
    createdAt,
  )
}

function insertLock(
  db: Database.Database,
  agentId: string,
  resourceType: string,
  resourceId: string,
  expiresAt: string,
) {
  db.prepare(`INSERT INTO resource_locks (agent_id, resource_type, resource_id, expires_at) VALUES (?, ?, ?, ?)`).run(
    agentId,
    resourceType,
    resourceId,
    expiresAt,
  )
}

const NOW = new Date()
const FRESH = new Date(NOW.getTime() - 10_000).toISOString() // 10s ago → active
const STALE = new Date(NOW.getTime() - 90_000).toISOString() // 90s ago → stale
const FUTURE = new Date(NOW.getTime() + 60_000).toISOString() // future expiry (valid lock)
const EXPIRED = new Date(NOW.getTime() - 60_000).toISOString() // past expiry (expired lock)

describe('getAgentActivity', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeDb()
  })

  // ── AC1 ───────────────────────────────────────────────────────────────────

  it('AC1: returns [] when no heartbeat events exist', () => {
    expect(getAgentActivity(db)).toEqual([])
  })

  it('AC1: returns [] when event_queue table missing (graceful degradation)', () => {
    const emptyDb = new Database(':memory:')
    expect(getAgentActivity(emptyDb)).toEqual([])
  })

  // ── AC2 ───────────────────────────────────────────────────────────────────

  it('AC2: returns active status for recent heartbeat (within 60s)', () => {
    insertHeartbeat(db, 'agent-1', FRESH)
    const result = getAgentActivity(db)
    expect(result).toHaveLength(1)
    expect(result[0]!.agentId).toBe('agent-1')
    expect(result[0]!.status).toBe('active')
  })

  it('AC2: returns stale status for old heartbeat (>60s)', () => {
    insertHeartbeat(db, 'agent-1', STALE)
    const result = getAgentActivity(db)
    expect(result[0]!.status).toBe('stale')
  })

  it('AC2: uses most recent heartbeat when multiple exist for same agent', () => {
    insertHeartbeat(db, 'agent-1', STALE)
    insertHeartbeat(db, 'agent-1', FRESH)
    const result = getAgentActivity(db)
    expect(result).toHaveLength(1)
    expect(result[0]!.status).toBe('active')
  })

  it('AC2: last heartbeat is correctly returned', () => {
    insertHeartbeat(db, 'agent-1', FRESH)
    const result = getAgentActivity(db)
    expect(result[0]!.lastHeartbeat).toBe(FRESH)
  })

  it('AC2: returns multiple agents with correct statuses', () => {
    insertHeartbeat(db, 'agent-active', FRESH)
    insertHeartbeat(db, 'agent-stale', STALE)
    const result = getAgentActivity(db)
    expect(result).toHaveLength(2)
    const active = result.find((r) => r.agentId === 'agent-active')
    const stale = result.find((r) => r.agentId === 'agent-stale')
    expect(active?.status).toBe('active')
    expect(stale?.status).toBe('stale')
  })

  // ── AC3 ───────────────────────────────────────────────────────────────────

  it('AC3: activeLocks=0 when no locks for agent', () => {
    insertHeartbeat(db, 'agent-1', FRESH)
    const result = getAgentActivity(db)
    expect(result[0]!.activeLocks).toBe(0)
  })

  it('AC3: activeLocks counts non-expired locks', () => {
    insertHeartbeat(db, 'agent-1', FRESH)
    insertLock(db, 'agent-1', 'resource', 'res:1', FUTURE)
    insertLock(db, 'agent-1', 'resource', 'res:2', FUTURE)
    const result = getAgentActivity(db)
    expect(result[0]!.activeLocks).toBe(2)
  })

  it('AC3: expired locks do not count', () => {
    insertHeartbeat(db, 'agent-1', FRESH)
    insertLock(db, 'agent-1', 'resource', 'res:1', EXPIRED)
    const result = getAgentActivity(db)
    expect(result[0]!.activeLocks).toBe(0)
  })

  it('AC3: lock counts are per-agent (isolation)', () => {
    insertHeartbeat(db, 'agent-a', FRESH)
    insertHeartbeat(db, 'agent-b', FRESH)
    insertLock(db, 'agent-a', 'resource', 'res:1', FUTURE)
    insertLock(db, 'agent-a', 'resource', 'res:2', FUTURE)
    insertLock(db, 'agent-b', 'resource', 'res:3', FUTURE)
    const result = getAgentActivity(db)
    const agentA = result.find((r) => r.agentId === 'agent-a')
    const agentB = result.find((r) => r.agentId === 'agent-b')
    expect(agentA?.activeLocks).toBe(2)
    expect(agentB?.activeLocks).toBe(1)
  })

  // ── AC4 ───────────────────────────────────────────────────────────────────

  it('AC4: currentTaskId=null when no task lock', () => {
    insertHeartbeat(db, 'agent-1', FRESH)
    const result = getAgentActivity(db)
    expect(result[0]!.currentTaskId).toBeNull()
  })

  it('AC4: currentTaskId extracted from task: resource lock', () => {
    insertHeartbeat(db, 'agent-1', FRESH)
    insertLock(db, 'agent-1', 'task', 'task:node_abc123', FUTURE)
    const result = getAgentActivity(db)
    expect(result[0]!.currentTaskId).toBe('node_abc123')
  })

  it('AC4: expired task lock does not set currentTaskId', () => {
    insertHeartbeat(db, 'agent-1', FRESH)
    insertLock(db, 'agent-1', 'task', 'task:node_abc123', EXPIRED)
    const result = getAgentActivity(db)
    expect(result[0]!.currentTaskId).toBeNull()
  })
})
