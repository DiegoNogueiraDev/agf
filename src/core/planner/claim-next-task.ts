/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Atomic task claim for `agf next` — lets N agents pull from one graph without
 * double-pulling the same task.
 *
 * WHY: plain `findNextTask` is a pure read — two agents calling `agf next` at the
 * same time both see the same highest-priority task and both grab it. This wraps
 * the selection in a lease: it asks {@link findNextTask} for the best task, then
 * tries to acquire an atomic lease on it via {@link LockManager} (the
 * `resource_locks` table — `resource_id` is a PRIMARY KEY and `lease_token` is
 * UNIQUE, so exactly one agent wins). If the task is already leased by another
 * agent it is added to `lockedTaskIds` and the next-best task is tried, until one
 * is claimed or the backlog is exhausted. Expired leases are swept by the lock
 * manager, so a crashed agent's task becomes claimable again.
 *
 * Reuses the existing selection ordering ({@link findNextTask}) and lease store
 * ({@link LockManager}) — no new ranking and no new table. §ADR-deterministic-first
 * aside from the lease token (a UUID minted by the lock manager).
 */

import type Database from 'better-sqlite3'
import { taskResourceId, taskIdFromResource } from './task-resource-key.js'
import type { GraphDocument, GraphNode } from '../graph/graph-types.js'
import { findNextTask, declaredFilesOf, type NextTaskOptions } from './next-task.js'
import { LockManager } from '../store/lock-manager.js'
import { LockConflictError } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'claim-next-task.ts' })

/** Resource-id namespace so locks on tasks don't collide with other resources. */

/** A claimed task plus the lease that proves the claim. */
export interface ClaimResult {
  node: GraphNode
  reason: string
  warning?: string
  claim: {
    agentId: string
    leaseToken: string
    /** ISO-8601 timestamp when the lease expires (claim must be renewed or completed before then). */
    expiresAt: string
  }
}

/** Options for {@link claimNextTask} — the {@link NextTaskOptions} plus the lease TTL. */
export interface ClaimNextTaskOptions extends NextTaskOptions {
  /** Lease time-to-live in seconds. Defaults to the LockManager default (5 min). */
  ttlSeconds?: number
}

/**
 * REQ-LCR-003: the Petri-net token model — WIP>1
 * across agents is only safe when their tasks touch disjoint files. Unions the
 * {@link declaredFilesOf} boundary (implementationFiles + testFiles +
 * metadata.touchedFiles) of every node in flight by ANOTHER agent, from two
 * sources: active leases AND in_progress nodes owned via metadata.claimedBy
 * (node_a268188b9c2e — the lease expires mid-task; the status is the durable
 * pheromone). The claiming agent's own work never self-blocks.
 */
function collectOtherAgentsTouchedFiles(doc: GraphDocument, locks: LockManager, agentId: string): Set<string> {
  const files = new Set<string>()
  const addDeclared = (node: GraphDocument['nodes'][number] | undefined): void => {
    if (!node) return
    for (const f of declaredFilesOf(node)) files.add(f)
  }
  for (const lock of locks.listActive()) {
    if (lock.agentId === agentId) continue
    const lockedNodeId = taskIdFromResource(lock.resourceId)
    if (lockedNodeId === null) continue
    addDeclared(doc.nodes.find((n) => n.id === lockedNodeId))
  }
  // node_a268188b9c2e — a lease (TTL de minutos) expira no meio de qualquer task
  // real; o feromônio durável é o status in_progress com dono (claimedBy). Uma
  // task em voo de OUTRA formiga protege seus arquivos declarados mesmo sem
  // lease viva; as do próprio agentId nunca o auto-bloqueiam.
  for (const node of doc.nodes) {
    if (node.status !== 'in_progress') continue
    const owner = (node.metadata as Record<string, unknown> | undefined)?.claimedBy
    if (typeof owner === 'string' && owner.length > 0 && owner !== agentId) addDeclared(node)
  }
  return files
}

/**
 * Select and atomically claim the next unblocked task for `agentId`. Skips tasks
 * already leased by other agents; returns null when nothing claimable remains.
 */
export function claimNextTask(
  doc: GraphDocument,
  locks: LockManager,
  agentId: string,
  opts: ClaimNextTaskOptions = {},
): ClaimResult | null {
  // Accumulate tasks that are contended this call so findNextTask skips them and
  // hands us the next-best candidate. Seeded with any caller-supplied locks.
  const lockedTaskIds = new Set<string>(opts.lockedTaskIds ?? [])

  // REQ-LCR-003: merge caller-supplied inFlightTouchedFiles with files touched by
  // every other agent's active lease, so findNextTask's Step 1.6 filter excludes
  // any candidate that would collide with in-flight work.
  const autoInFlight = collectOtherAgentsTouchedFiles(doc, locks, agentId)
  const inFlightTouchedFiles =
    autoInFlight.size === 0 && !opts.inFlightTouchedFiles
      ? undefined
      : new Set<string>([...(opts.inFlightTouchedFiles ?? []), ...autoInFlight])

  // Bound the loop by the node count — every miss adds exactly one id, so we can
  // never iterate more than there are tasks.
  const maxAttempts = doc.nodes.length + 1
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = findNextTask(doc, { ...opts, lockedTaskIds, inFlightTouchedFiles })
    if (!result) return null

    try {
      const lease = locks.acquire(taskResourceId(result.node.id), agentId, opts.ttlSeconds)
      log.debug('claim:acquired', { nodeId: result.node.id, agentId })
      return {
        node: result.node,
        reason: result.reason,
        ...(result.warning ? { warning: result.warning } : {}),
        claim: { agentId, leaseToken: lease.leaseToken, expiresAt: lease.expiresAt },
      }
    } catch (err) {
      if (err instanceof LockConflictError) {
        // Held by another agent — exclude and try the next-best task.
        lockedTaskIds.add(result.node.id)
        log.debug('claim:contended', { nodeId: result.node.id, agentId })
        continue
      }
      throw err
    }
  }

  return null
}

/**
 * Return the node ID of an existing live claim held by `agentId`, or null if none.
 * Resource IDs are stored as `task:<nodeId>`; this strips the prefix and checks
 * that the lease has not expired. Used by `agf next` to short-circuit WIP=1
 * enforcement across processes.
 */
export function findAgentClaim(db: Database.Database, agentId: string): string | null {
  const now = new Date().toISOString()
  const row = db
    .prepare('SELECT resource_id FROM resource_locks WHERE agent_id = ? AND expires_at > ? LIMIT 1')
    .get(agentId, now) as { resource_id: string } | undefined

  if (!row) return null
  // Strip the 'task:' prefix to return the bare node ID.
  return taskIdFromResource(row.resource_id) ?? row.resource_id
}
