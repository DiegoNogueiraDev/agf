/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Atomicity verifier (M7). A leaf task/subtask is atomic only if the
 * decomposition engine would NOT flag it as "large" (single source of truth for
 * the thresholds: estimate ≤120min, xpSize < L, AC ≤5). Tasks already
 * decomposed (with children) are excluded by {@link detectLargeTasks}.
 * Deterministic, zero-token.
 */

import type { GraphDocument, GraphNode } from '../graph/graph-types.js'
import { detectLargeTasks } from './decompose.js'

export interface NonAtomicTask {
  node: GraphNode
  reasons: string[]
}

/** Leaf task/subtask nodes that are too large to be a single atomic unit. */
export function nonAtomicTasks(doc: GraphDocument): NonAtomicTask[] {
  return detectLargeTasks(doc)
    .filter((r) => r.node.type === 'task' || r.node.type === 'subtask')
    .map((r) => ({ node: r.node, reasons: r.reasons }))
}

/** True if the node is NOT flagged as a large leaf (atomic, or not a task). */
export function isAtomic(doc: GraphDocument, nodeId: string): boolean {
  return !nonAtomicTasks(doc).some((r) => r.node.id === nodeId)
}
