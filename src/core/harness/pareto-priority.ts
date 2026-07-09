/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Pareto Priority Score — Identify top 20% dimensions by weighted impact
 *
 * Ranks dimensions by impact = gap * weight, identifies the Pareto set
 * (top 20% that covers ~80% of total improvement potential).
 */

import type { HarnessDimension } from './violation-detail.js'

export interface DimensionGap {
  dimension: HarnessDimension
  score: number
  weight: number
  gap: number
}

export interface PrioritizedDimension {
  dimension: HarnessDimension
  score: number
  impact: number
  isPareto: boolean
}

/**
 * Calculate Pareto priority for dimensions.
 * Returns sorted by impact desc with isPareto flag on top 20%.
 */
export function calculateParetoPriority(gaps: DimensionGap[]): PrioritizedDimension[] {
  if (gaps.length === 0) return []

  const ranked = gaps
    .map((g) => ({
      dimension: g.dimension,
      score: g.score,
      impact: Math.round(g.gap * g.weight * 100) / 100,
      isPareto: false,
    }))
    .sort((a, b) => b.impact - a.impact)

  // Mark top 20% as Pareto (minimum 1)
  const paretoCount = Math.max(1, Math.ceil(ranked.length * 0.2))
  for (let i = 0; i < paretoCount && i < ranked.length; i++) {
    ranked[i].isPareto = true
  }

  return ranked
}
