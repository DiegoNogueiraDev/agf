/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_442222a830b4 — AgentClaimManager: lease+TTL mutual exclusion over graph
 * resources, so async parallel agents (the LSTM §3 "parameter server" workers)
 * never double-claim the same node. Ported from graph-flow/core/swarm.
 */
import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { AgentClaimManager, AgentClaimConflictError } from '../core/swarm/agent-claim-manager.js'

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

describe('AgentClaimManager — lease+TTL mutual exclusion (#node_442222a830b4)', () => {
  it('claim() acquires a lock and returns a lease token + expiry', () => {
    const mgr = new AgentClaimManager(freshDb())
    const claim = mgr.claim('node_a', 'agent_1')
    expect(claim.resourceId).toBe('node_a')
    expect(claim.agentId).toBe('agent_1')
    expect(claim.leaseToken).toMatch(/.+/)
    expect(new Date(claim.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('a second agent claiming the same resource throws a retryable AgentClaimConflictError', () => {
    const mgr = new AgentClaimManager(freshDb())
    mgr.claim('node_a', 'agent_1')
    try {
      mgr.claim('node_a', 'agent_2')
      expect.unreachable('expected a conflict')
    } catch (err) {
      expect(err).toBeInstanceOf(AgentClaimConflictError)
      expect((err as AgentClaimConflictError).retryable).toBe(true)
      // surfaces the current owner so the caller can wait/skip
      expect((err as Error).message).toContain('agent_1')
    }
  })

  it('the same agent can re-claim its own resource (idempotent TTL upgrade)', () => {
    const mgr = new AgentClaimManager(freshDb())
    const first = mgr.claim('node_a', 'agent_1')
    const again = mgr.claim('node_a', 'agent_1')
    expect(again.resourceId).toBe('node_a')
    // a fresh lease token is minted on upgrade
    expect(again.leaseToken).not.toBe(first.leaseToken)
  })

  it('tryClaim() returns null on conflict instead of throwing', () => {
    const mgr = new AgentClaimManager(freshDb())
    expect(mgr.tryClaim('node_a', 'agent_1')).not.toBeNull()
    expect(mgr.tryClaim('node_a', 'agent_2')).toBeNull()
  })

  it('release() frees the resource so another agent can claim it', () => {
    const mgr = new AgentClaimManager(freshDb())
    const claim = mgr.claim('node_a', 'agent_1')
    mgr.release(claim.leaseToken)
    // now agent_2 can take it
    expect(mgr.tryClaim('node_a', 'agent_2')).not.toBeNull()
  })

  it('release() is idempotent — an unknown lease token is a no-op', () => {
    const mgr = new AgentClaimManager(freshDb())
    expect(() => mgr.release('does-not-exist')).not.toThrow()
  })

  it('sweepStale() removes expired claims and reports the count', () => {
    const mgr = new AgentClaimManager(freshDb())
    // ttl=0 → already expired on insert
    mgr.claim('node_a', 'agent_1', 0)
    expect(mgr.sweepStale()).toBe(1)
    // after sweeping, another agent can claim it
    expect(mgr.tryClaim('node_a', 'agent_2')).not.toBeNull()
  })
})
