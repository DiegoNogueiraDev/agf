/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Epistemic Mix — pure computation over a set of nodes' epistemic tiers.
 *
 * Computes the tier distribution (counts + percentages), groups nodes per tier
 * for drill-down, and flags epics whose mix is dominated by unbacked claims as
 * low-maturity. Feeds harness/provenance views; the read-side companion to
 * tier-promotion / tier-downgrade.
 *
 * Ported from graph-flow/core/provenance/epistemic-mix.ts.
 */

import type { EpistemicTier } from './tier-promotion.js'

export interface TierNode {
  readonly id: string
  readonly title: string
  readonly tier: EpistemicTier
}

export interface TierDistribution {
  readonly claim: number
  readonly cited: number
  readonly validated: number
  readonly proven: number
  readonly total: number
  /** Percentage values (0–100). */
  readonly claimPct: number
  readonly citedPct: number
  readonly validatedPct: number
  readonly provenPct: number
}

export type GroupedByTier = Record<EpistemicTier, TierNode[]>

/** Compute tier counts and percentages. Returns zero percentages when total is
 * 0 (avoids division by zero). */
export function computeTierDistribution(nodes: TierNode[]): TierDistribution {
  const counts = { claim: 0, cited: 0, validated: 0, proven: 0 }
  for (const node of nodes) {
    counts[node.tier]++
  }
  const total = nodes.length
  const pct = (n: number): number => (total === 0 ? 0 : Math.round((n / total) * 100 * 10) / 10)
  return {
    ...counts,
    total,
    claimPct: pct(counts.claim),
    citedPct: pct(counts.cited),
    validatedPct: pct(counts.validated),
    provenPct: pct(counts.proven),
  }
}

/** Group nodes by their epistemic tier, returning arrays per tier. */
export function groupNodesByTier(nodes: TierNode[]): GroupedByTier {
  const groups: GroupedByTier = { claim: [], cited: [], validated: [], proven: [] }
  for (const node of nodes) {
    groups[node.tier].push(node)
  }
  return groups
}

/** True when more than 50% of nodes are at "claim" tier — the epic has low
 * epistemic maturity (mostly unbacked assertions). */
export function isLowMaturityEpic(dist: TierDistribution): boolean {
  if (dist.total === 0) return false
  return dist.claim / dist.total > 0.5
}
