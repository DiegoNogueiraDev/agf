/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §extracta-sweep-1 — Evolution audit analyzer (Hive auto-merge inspiration).
 *
 * Surfaces nodes that were regenerated during the lifecycle alongside their
 * latest reason, so an operator can answer "why did this node get rebuilt?"
 * at a glance. Pure decision module: no I/O, takes a `GraphDocument` and
 * returns a structured report.
 */

import type { GraphDocument, GraphNode } from '../graph/graph-types.js'

export interface EvolutionAuditEntry {
  readonly nodeId: string
  readonly title: string
  readonly type: GraphNode['type']
  readonly status: GraphNode['status']
  readonly evolutionCount: number
  readonly evolutionReason: string
}

export interface EvolutionAuditReport {
  /** Total nodes that have been regenerated at least once. */
  readonly totalRegenerated: number
  /** Sum of `evolution_count` across all nodes. */
  readonly totalRegenerations: number
  /** Top regenerated nodes, sorted by count desc, ties broken by updatedAt. */
  readonly top: ReadonlyArray<EvolutionAuditEntry>
  /** Distinct evolution reasons grouped by frequency (helps spot recurring patterns). */
  readonly byReason: ReadonlyArray<{ readonly reason: string; readonly count: number }>
  /** Human-readable summary line. */
  readonly summary: string
}

const DEFAULT_TOP_LIMIT = 10

/** analyzeEvolutionAudit —  */
export function analyzeEvolutionAudit(
  doc: GraphDocument,
  options: { readonly topLimit?: number } = {},
): EvolutionAuditReport {
  const topLimit = Math.max(1, options.topLimit ?? DEFAULT_TOP_LIMIT)

  const regenerated = doc.nodes.filter((n) => (n.evolutionCount ?? 0) > 0 && typeof n.evolutionReason === 'string')

  const totalRegenerations = regenerated.reduce((sum, n) => sum + (n.evolutionCount ?? 0), 0)

  const sorted = [...regenerated].sort((a, b) => {
    const ca = a.evolutionCount ?? 0
    const cb = b.evolutionCount ?? 0
    if (ca !== cb) return cb - ca
    return b.updatedAt.localeCompare(a.updatedAt)
  })

  const top: EvolutionAuditEntry[] = sorted.slice(0, topLimit).map((n) => ({
    nodeId: n.id,
    title: n.title,
    type: n.type,
    status: n.status,
    evolutionCount: n.evolutionCount ?? 0,
    evolutionReason: n.evolutionReason ?? '',
  }))

  const reasonCounts = new Map<string, number>()
  for (const nVar of regenerated) {
    const rVar = (nVar.evolutionReason ?? '').trim()
    if (rVar.length === 0) continue
    reasonCounts.set(rVar, (reasonCounts.get(rVar) ?? 0) + 1)
  }
  const byReason = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)

  const summary =
    regenerated.length === 0
      ? 'no nodes regenerated'
      : `${regenerated.length} node(s) regenerated · ${totalRegenerations} total regeneration(s) · ${byReason.length} distinct reason(s)`

  return {
    totalRegenerated: regenerated.length,
    totalRegenerations,
    top,
    byReason,
    summary,
  }
}
