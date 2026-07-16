/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * independentSet(doc, k) — up to `k` unblocked tasks with NO mutual transitive
 * depends_on relationship, so N colony ants can pull them in parallel without
 * ordering conflicts (node_0d67eca280f6; feeds the worktree-per-ant colony).
 *
 * Two tasks are "on the same dependency path" when one is a transitive blocker of
 * the other — one must finish before the other, so they cannot be parallelized.
 * Greedy over a deterministic candidate order (priority desc, then id asc), it
 * reuses {@link findTransitiveBlockers} (DRY — the same-file transitive walk) and
 * keeps only pairwise-independent picks. Pure, deterministic, ~0 token.
 *
 * Boundary (WIP=1 preserved): all-blocked / no candidates ⇒ [] (length ≤ 1),
 * never throws; k ≤ 0 ⇒ [].
 */

import type { GraphDocument, GraphNode } from '../graph/graph-types.js'
import { findTransitiveBlockers } from './dependency-chain.js'

/** A pullable candidate: an unblocked task/subtask still in backlog or ready. */
function isCandidate(node: GraphNode): boolean {
  return (
    (node.type === 'task' || node.type === 'subtask') &&
    (node.status === 'backlog' || node.status === 'ready') &&
    !node.blocked
  )
}

export function independentSet(doc: GraphDocument, k: number): GraphNode[] {
  if (k <= 0) return []

  const candidates = doc.nodes
    .filter(isCandidate)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id))

  // Precompute each candidate's transitive-blocker id-set once (reuse, no re-walk per pair).
  const blockersOf = new Map<string, Set<string>>()
  for (const cand of candidates) {
    blockersOf.set(cand.id, new Set(findTransitiveBlockers(doc, cand.id).map((n) => n.id)))
  }

  const selected: GraphNode[] = []
  for (const cand of candidates) {
    if (selected.length >= k) break
    const candBlockers = blockersOf.get(cand.id) ?? new Set<string>()
    // Conflict if cand depends on a selected task, or a selected task depends on cand.
    const conflicts = selected.some((s) => candBlockers.has(s.id) || (blockersOf.get(s.id)?.has(cand.id) ?? false))
    if (!conflicts) selected.push(cand)
  }

  return selected
}
