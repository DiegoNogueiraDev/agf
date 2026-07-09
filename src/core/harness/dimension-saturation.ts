/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Dimension saturation detection for the harness circuit breaker.
 *
 * Saturation: a harness dimension scores > 85 for 2+ consecutive cycles
 * with abs(delta) < 2pts — meaning the dimension has plateaued.
 *
 * When saturated, the pivot target is the weakest non-saturated dimension,
 * guiding the Colony Scan to route tasks toward more impactful areas.
 */

export const HARNESS_DIMENSIONS = [
  'types',
  'tests',
  'fitness',
  'docs',
  'naming',
  'errors',
  'context',
  'provenance',
] as const

export type HarnessDimension = (typeof HARNESS_DIMENSIONS)[number]

export interface HistoryEntry {
  breakdown: string
  timestamp: string
  score: number
}

export interface SaturationSignal {
  saturated: boolean
  dimension: HarnessDimension | null
  pivotTo: HarnessDimension | null
}

const SATURATION_THRESHOLD = 85
const SATURATION_DELTA = 2

function dimScore(breakdown: Record<string, { score: number }>, dim: string): number {
  return breakdown[dim]?.score ?? 0
}

function isSaturated(
  current: Record<string, { score: number }>,
  prev: Record<string, { score: number }>,
  dim: string,
): boolean {
  const cs = dimScore(current, dim)
  const ps = dimScore(prev, dim)
  return cs > SATURATION_THRESHOLD && ps > SATURATION_THRESHOLD && Math.abs(cs - ps) < SATURATION_DELTA
}

export function detectDimensionSaturation(
  history: HistoryEntry[],
  currentBreakdown: Record<string, { score: number }>,
): SaturationSignal {
  if (history.length === 0) {
    return { saturated: false, dimension: null, pivotTo: null }
  }

  const prevEntry = history[history.length - 1]
  const prevBreakdown = JSON.parse(prevEntry.breakdown) as Record<string, { score: number }>

  const saturatedDims = HARNESS_DIMENSIONS.filter((dim) => isSaturated(currentBreakdown, prevBreakdown, dim))

  if (saturatedDims.length === 0) {
    return { saturated: false, dimension: null, pivotTo: null }
  }

  const firstSaturated = saturatedDims[0]

  const unsaturated = HARNESS_DIMENSIONS.filter((dim) => !saturatedDims.includes(dim))

  if (unsaturated.length === 0) {
    return { saturated: true, dimension: firstSaturated, pivotTo: null }
  }

  const weakest = unsaturated.reduce<HarnessDimension>((acc, dim) => {
    return dimScore(currentBreakdown, dim) < dimScore(currentBreakdown, acc) ? dim : acc
  }, unsaturated[0])

  return { saturated: true, dimension: firstSaturated, pivotTo: weakest }
}
