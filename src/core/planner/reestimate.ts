/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Estimate-drift detector (M9, graph-only). Flags tasks whose `estimateMinutes`
 * is inconsistent with their `xpSize` — a frequent planning defect (an "XL"
 * sized 15min, or an "XS" sized 4h). Ranges mirror the decompose sizing.
 * Deterministic, zero-token.
 *
 * Follow-up (not here): velocity-based re-estimation from historical actuals
 * (`calculateVelocity`) and transitive-dependency ordering in `next-task.ts`.
 */

import type { GraphDocument, GraphNode } from '../graph/graph-types.js'

const TASK_TYPES = new Set(['task', 'subtask'])

/** Expected estimate range (minutes) per XP size — mirrors decompose.ts sizing. */
const SIZE_RANGES: Record<string, [number, number]> = {
  XS: [0, 15],
  S: [16, 30],
  M: [31, 60],
  L: [61, 120],
  XL: [121, Number.POSITIVE_INFINITY],
}

export interface EstimateDrift {
  node: GraphNode
  xpSize: string
  estimateMinutes: number
  expected: [number, number]
}

/** Render an expected range for display. */
export function formatRange([min, max]: [number, number]): string {
  return max === Number.POSITIVE_INFINITY ? `> ${min - 1}min` : `${min}-${max}min`
}

/** Tasks whose estimateMinutes is inconsistent with their xpSize. */
export function estimateDrifts(doc: GraphDocument): EstimateDrift[] {
  const out: EstimateDrift[] = []
  for (const node of doc.nodes) {
    if (!TASK_TYPES.has(node.type) || node.status === 'done') continue
    const xpSize = node.xpSize
    const est = node.estimateMinutes
    if (!xpSize || est == null) continue // missing data is a different gap, not a drift
    const range = SIZE_RANGES[xpSize]
    if (!range) continue
    if (est < range[0] || est > range[1]) {
      out.push({ node, xpSize, estimateMinutes: est, expected: range })
    }
  }
  return out
}
