/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * AgentClaimManager — lease+TTL mutual exclusion over graph resources.
 *
 * The agentic loop fans out N parallel workers against one shared graph (the
 * "parameter server" of Sak et al. 2014, §3 distributed async training). Async
 * updates only converge if workers never act on the same node at once. This is
 * the reconciliation layer: a worker must `claim` a node before touching it;
 * a conflicting claim is retryable (wait/skip), and stale leases self-expire so
 * a crashed worker never deadlocks the graph.
 *
 * Ported from graph-flow/core/swarm/agent-claim-manager.ts. The graph-flow
 * version emitted agent:pre/post-spawn hooks; that coupling is intentionally
 * dropped here to keep the blast radius minimal — the lock semantics are the
 * essence. Thin wrapper over the existing {@link LockManager}.
 */

import type Database from 'better-sqlite3'
import { LockManager } from '../store/lock-manager.js'
import { McpGraphError } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'agent-claim-manager' })

/** Default claim lease: 5 minutes. A crashed worker's claim expires after this. */
const CLAIM_TTL_SECONDS = 300

/** Raised when a resource is already claimed by another agent. Retryable: the
 * caller may wait for the lease to expire or skip the resource. */
export class AgentClaimConflictError extends McpGraphError {
  readonly retryable = true

  constructor(resourceId: string, lockedBy: string) {
    super(`Resource "${resourceId}" already claimed by agent "${lockedBy}"`)
    this.name = 'AgentClaimConflictError'
  }
}

export interface ClaimResult {
  resourceId: string
  agentId: string
  leaseToken: string
  expiresAt: string
}

/** Thin wrapper over LockManager that provides agent-task claim semantics. */
export class AgentClaimManager {
  private readonly locks: LockManager

  constructor(db: Database.Database) {
    this.locks = new LockManager(db)
  }

  /** Claim a resource for an agent. Throws AgentClaimConflictError (retryable)
   * when another agent holds a live lease. The same agent re-claiming its own
   * resource upgrades the TTL (idempotent). */
  claim(resourceId: string, agentId: string, ttlSeconds: number = CLAIM_TTL_SECONDS): ClaimResult {
    try {
      const result = this.locks.acquire(resourceId, agentId, ttlSeconds)
      log.debug('swarm:claim', { resourceId, agentId })
      return {
        resourceId: result.resourceId,
        agentId: result.agentId,
        leaseToken: result.leaseToken,
        expiresAt: result.expiresAt,
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'LockConflictError') {
        const conflict = err as Error & { details?: { owner?: string } }
        throw new AgentClaimConflictError(resourceId, conflict.details?.owner ?? 'unknown')
      }
      throw err
    }
  }

  /** Non-throwing claim: returns the {@link ClaimResult} on success, or `null`
   * when another agent already holds the resource. Convenient for fan-out loops
   * that skip contended nodes rather than retry. */
  tryClaim(resourceId: string, agentId: string, ttlSeconds: number = CLAIM_TTL_SECONDS): ClaimResult | null {
    try {
      return this.claim(resourceId, agentId, ttlSeconds)
    } catch (err) {
      if (err instanceof AgentClaimConflictError) return null
      throw err
    }
  }

  /** Release a claim by lease token. Idempotent — a missing/expired token is a
   * no-op (the lease may already have been swept). */
  release(leaseToken: string): void {
    try {
      this.locks.release(leaseToken)
      log.debug('swarm:release', { leaseToken })
    } catch {
      // token already gone — idempotent by design
    }
  }

  /** Remove expired claims. Returns the count of swept leases. */
  sweepStale(): number {
    const count = this.locks.cleanExpired()
    if (count > 0) {
      log.info('swarm:sweep', { swept: count })
    }
    return count
  }
}
