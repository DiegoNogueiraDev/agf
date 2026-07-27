/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * colony-batch — the colony pulls the {@link independentSet} into parallel claims
 * (node_5e44fdf17849). WIP=1 is relaxed ONLY across the dependency-independent set;
 * everything else stays serial.
 *
 * Zero new coordination — it composes three existing primitives:
 *  - {@link independentSet}: ≤k tasks with no mutual transitive depends_on.
 *  - {@link LockManager} (resource_locks, `resource_id` PK): exactly-one-winner
 *    atomic lease — a task already held by another ant throws {@link LockConflictError}
 *    and is skipped, never double-claimed.
 *  - {@link declaredFilesOf}: the implementationFiles+testFiles boundary — two ants
 *    whose boundaries overlap would race the same file, so the second is serialized
 *    out of THIS batch (it stays claimable once the first releases). AC3's zero-
 *    collision NFR is covered here + by the lease, not reinvented.
 *
 * Deterministic given the graph + lock state. The caller runs each claimed ant in
 * its own worktree (ant spawn); this function only selects + atomically claims.
 */

import type { GraphDocument, GraphNode } from '../graph/graph-types.js'
import type { LockManager } from '../store/lock-manager.js'
import { LockConflictError } from '../utils/errors.js'
import { independentSet } from '../planner/independent-set.js'
import { declaredFilesOf } from '../planner/next-task.js'
import { taskResourceId } from '../planner/task-resource-key.js'

/** One atomically-claimed ant slot in a parallel batch. */
export interface ColonyClaim {
  node: GraphNode
  agentId: string
  leaseToken: string
}

/** Default per-slot agent id — the caller may override to match real ant identities. */
const defaultAgentIdOf = (index: number): string => `ant-${index}`

/**
 * Pull up to `k` independent tasks and atomically claim each for a distinct ant.
 * A task is skipped (serialized out) when its declared-file boundary collides with
 * an already-claimed task in this batch, or when another ant already holds its lease.
 */
export function pullIndependentBatch(
  doc: GraphDocument,
  locks: LockManager,
  k: number,
  agentIdOf: (index: number) => string = defaultAgentIdOf,
): ColonyClaim[] {
  if (k <= 0) return []

  const claimed: ColonyClaim[] = []
  const takenFiles = new Set<string>()

  for (const node of independentSet(doc, k)) {
    const files = declaredFilesOf(node)
    // AC3: a file-boundary collision with an already-claimed ant → serialize out.
    if (files.some((f) => takenFiles.has(f))) continue

    const agentId = agentIdOf(claimed.length)
    try {
      const lease = locks.acquire(taskResourceId(node.id), agentId)
      for (const file of files) takenFiles.add(file)
      claimed.push({ node, agentId, leaseToken: lease.leaseToken })
    } catch (err) {
      // Another ant won the atomic race — leave the task for a later batch.
      if (err instanceof LockConflictError) continue
      throw err
    }
  }

  return claimed
}
