/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Sensor Fusion Engine — Weighted Cluster Aggregation
 *
 * Aggregates 7 dimension scores into correlated clusters.
 * Identifies root causes of degradation using pre-defined semantic correlations.
 * ADR-V4-01: Static cluster aggregation (not ML), configurable clusters.
 */

import type { HarnessDimension } from './violation-detail.js'

export interface DimensionScores {
  types: number
  tests: number
  naming: number
  errors: number
  context: number
  docs: number
  fitness: number
}

export interface SensorCluster {
  rootCause: string
  affectedDimensions: HarnessDimension[]
  combinedImpact: number
}

/** Dimension weights in the composite score (must match harnessability-score.ts) */
const WEIGHTS: Record<HarnessDimension, number> = {
  types: 0.25,
  tests: 0.25,
  naming: 0.1,
  errors: 0.05,
  context: 0.05,
  docs: 0.15,
  fitness: 0.15,
}

/** Pre-defined semantic clusters (ADR-V4-01) */
const CLUSTER_DEFINITIONS: Array<{
  name: string
  rootCause: string
  dimensions: HarnessDimension[]
}> = [
  {
    name: 'code_quality',
    rootCause: 'Type safety and error handling are correlated — typed errors improve both',
    dimensions: ['types', 'errors'],
  },
  {
    name: 'structural_integrity',
    rootCause: 'Test coverage and architecture fitness reinforce each other',
    dimensions: ['tests', 'fitness'],
  },
  {
    name: 'readability',
    rootCause: 'Naming clarity and JSDoc density both improve code readability',
    dimensions: ['naming', 'context'],
  },
  {
    name: 'onboarding',
    rootCause: 'Documentation is the primary onboarding dimension',
    dimensions: ['docs'],
  },
]

/** Threshold below which a dimension is considered "weak" */
const WEAK_THRESHOLD = 70

/** Minimum gap (100 - score) * weight to include in cluster impact */
const MIN_GAP_THRESHOLD = 5

/**
 * Fuse 7 dimension scores into correlated clusters.
 * Returns clusters sorted by combinedImpact (desc).
 * Returns empty array if all dimensions >= 85.
 */
export function fuseSensors(scores: DimensionScores): SensorCluster[] {
  // Check if all healthy (>= 85) → no clusters
  const allHealthy = Object.values(scores).every((s) => s >= 85)
  if (allHealthy) return []

  const clusters: SensorCluster[] = []

  for (const def of CLUSTER_DEFINITIONS) {
    const weakDims = def.dimensions.filter((d) => scores[d] < WEAK_THRESHOLD)

    if (weakDims.length === 0) continue

    // Combined impact = sum of (gap * weight) for weak dimensions
    const combinedImpact = weakDims.reduce((sum, d) => {
      const gap = 100 - scores[d]
      return sum + gap * WEIGHTS[d]
    }, 0)

    if (combinedImpact < MIN_GAP_THRESHOLD) continue

    clusters.push({
      rootCause: def.rootCause,
      affectedDimensions: weakDims,
      combinedImpact: Math.round(combinedImpact * 10) / 10,
    })
  }

  // Sort by impact descending
  clusters.sort((a, b) => b.combinedImpact - a.combinedImpact)

  return clusters
}
