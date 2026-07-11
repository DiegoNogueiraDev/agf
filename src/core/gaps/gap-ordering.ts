/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Gap ordering by edge-unblocking count.
 *
 * Each Gap is enriched with `edgeUnblockingCount` — the number of
 * `depends_on`/`blocks` edges from its nodeId to non-done target nodes.
 * Higher count = this gap blocks more downstream work = higher priority.
 */

import type { Gap, GapSeverity } from './gap-types.js'
import type { GraphDocument } from '../graph/graph-types.js'

export interface EnrichedGap extends Gap {
  edgeUnblockingCount: number
}

export interface SortGapsByImpactOptions {
  /** When false, returns gaps in original insertion order (M1–M9 compat). Default: true */
  orderByImpact?: boolean
}

const BLOCKING_RELATION_TYPES = new Set(['depends_on', 'blocks'])

/** Compute edgeUnblockingCount for a single nodeId. */
function computeUnblockingCount(nodeId: string | undefined, doc: GraphDocument): number {
  if (!nodeId) return 0

  // Build a fast lookup for node statuses
  const nodeStatus = new Map<string, string>()
  for (const n of doc.nodes) {
    nodeStatus.set(n.id, n.status)
  }

  let count = 0
  for (const edge of doc.edges) {
    if (edge.from !== nodeId) continue
    if (!BLOCKING_RELATION_TYPES.has(edge.relationType)) continue
    const targetStatus = nodeStatus.get(edge.to) ?? 'backlog'
    if (targetStatus !== 'done') count++
  }
  return count
}

/** Enrich gaps with edgeUnblockingCount (immutable — returns new objects). */
export function enrichGapsWithEdgeCount(gaps: Gap[], doc: GraphDocument): EnrichedGap[] {
  return gaps.map((g) => ({
    ...g,
    edgeUnblockingCount: computeUnblockingCount(g.nodeId, doc),
  }))
}

const SEVERITY_ORDER: Record<GapSeverity, number> = { required: 0, recommended: 1 }

/**
 * Sort gaps by impact descending: edgeUnblockingCount DESC, then severity (required first).
 * Gaps without nodeId always appear after gaps with nodeId.
 * When `orderByImpact=false`, returns gaps in original order.
 */
export function sortGapsByImpact(gaps: Gap[], doc: GraphDocument, opts: SortGapsByImpactOptions = {}): EnrichedGap[] {
  const enriched = enrichGapsWithEdgeCount(gaps, doc)

  if (opts.orderByImpact === false) return enriched

  return [...enriched].sort((a, b) => {
    // Gaps without nodeId go last
    const aHasNode = a.nodeId !== undefined ? 0 : 1
    const bHasNode = b.nodeId !== undefined ? 0 : 1
    if (aHasNode !== bHasNode) return aHasNode - bHasNode

    // Both project-wide → preserve original order (stable sort guarantee)
    if (aHasNode === 1 && bHasNode === 1) return 0

    // Sort by edgeUnblockingCount DESC
    if (b.edgeUnblockingCount !== a.edgeUnblockingCount) {
      return b.edgeUnblockingCount - a.edgeUnblockingCount
    }

    // Tiebreak by severity (required before recommended)
    return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  })
}
