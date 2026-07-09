/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §autonomous-iter-1 — Fair distribution of violation cap across
 * dimensions. Without this, a dominant dimension (eg `tests` with 443
 * entries) eats the entire 500-violation cap before smaller dimensions
 * (eg `errors`) get appended, leading to `analyze(harness_remediate)`
 * reporting 0 fixes for the dimensions most worth fixing.
 *
 * The distribution proceeds smallest-first: dimensions with fewer
 * violations are fully included before larger ones share the leftover
 * budget. This guarantees every present dimension surfaces in the
 * output as long as there is any room.
 */

import type { ViolationDetail } from './violation-detail.js'

/**
 * Distribute violations fairly across dimensions, capped at
 * `maxViolations` total. Optionally cap each dimension at
 * `maxPerDimension`. Smaller dimensions are added first so big
 * dimensions never push small ones out of the output entirely.
 */
export function distributeViolationsFairly(
  all: ReadonlyArray<ViolationDetail>,
  maxViolations: number,
  maxPerDimension?: number,
): ViolationDetail[] {
  if (all.length === 0) return []

  // Group by dimension, preserve insertion order within each group.
  const byDim = new Map<string, ViolationDetail[]>()
  for (const vVar of all) {
    const key = vVar.dimension
    const arr = byDim.get(key)
    if (arr) {
      arr.push(vVar)
    } else {
      byDim.set(key, [vVar])
    }
  }

  // Order dimensions smallest-first so the cap reaches every dimension
  // before being consumed by the largest.
  const ordered = [...byDim.entries()].sort((a, b) => a[1].length - b[1].length)

  const out: ViolationDetail[] = []
  let remaining = maxViolations
  let dimsLeft = ordered.length

  for (const [, list] of ordered) {
    if (remaining <= 0) break
    // Equal-share quota for the dimensions still to be processed,
    // capped at maxPerDimension if provided. Always at least 1 so
    // even the last dimension gets representation.
    const equalShare = Math.max(1, Math.floor(remaining / dimsLeft))
    const dimCap = maxPerDimension !== undefined ? Math.min(equalShare, maxPerDimension) : equalShare
    const take = Math.min(list.length, dimCap, remaining)
    for (let i = 0; i < take; i++) {
      const itemValue = list[i]
      if (itemValue) out.push(itemValue)
    }
    remaining -= take
    dimsLeft -= 1
  }

  return out
}
