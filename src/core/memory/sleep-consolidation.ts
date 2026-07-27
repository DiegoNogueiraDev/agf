/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Sleep-consolidation — offline downscaling + dedup of memory traces (SHY).
 *
 * Anchor: Tononi & Cirelli's Synaptic Homeostasis Hypothesis. Waking learning
 * potentiates synapses (net strength grows, saturating signal-to-noise); slow-wave
 * sleep **downscales them multiplicatively** — preserving relative weights, renormalizing
 * the total, consolidating the essential and restoring SNR. Here: multiplicatively
 * downscale trace salience, merge near-duplicates (NCD, item 6), and prune traces that
 * fall below a floor — keeping the per-task memory-inject lean over time.
 *
 * Pure & deterministic. Intended as an offline pass (e.g. `agf gc`). Token lever `consolidation`.
 */

import { ncd } from '../economy/ncd-dedup.js'

export interface MemoryTrace {
  key: string
  salience: number
  content: string
}

export interface ConsolidationOptions {
  /** Multiplicative downscale factor applied to every trace's salience. Default 0.5. */
  downscale?: number
  /** Drop traces whose downscaled salience is below this. Default 0. */
  floor?: number
  /** Merge traces whose NCD is below this. Default 0.3. */
  mergeThreshold?: number
}

export interface ConsolidationResult {
  /** Surviving traces (downscaled, deduped), highest salience first. */
  consolidated: MemoryTrace[]
  /** Number of traces pruned below the floor. */
  dropped: number
  /** Number of merge events (near-duplicates folded into a representative). */
  merged: number
}

/**
 * Run one consolidation pass: downscale → merge near-duplicates (summing salience) → prune below floor.
 * Deterministic; the surviving set is stable under re-runs of well-above-floor traces.
 */
export function consolidateTraces(traces: MemoryTrace[], opts: ConsolidationOptions = {}): ConsolidationResult {
  const downscale = opts.downscale ?? 0.5
  const floor = opts.floor ?? 0
  const mergeThreshold = opts.mergeThreshold ?? 0.3
  if (traces.length === 0) return { consolidated: [], dropped: 0, merged: 0 }

  // 1. Multiplicative downscaling (preserves relative order, renormalizes magnitude).
  const scaled = traces.map((t) => ({ ...t, salience: t.salience * downscale }))

  // 2. Merge near-duplicates into representatives (first occurrence wins identity).
  const reps: MemoryTrace[] = []
  let merged = 0
  for (const t of scaled) {
    const rep = reps.find((r) => ncd(r.content, t.content) < mergeThreshold)
    if (rep) {
      rep.salience += t.salience
      merged++
    } else {
      reps.push({ ...t })
    }
  }

  // 3. Prune below the floor.
  const before = reps.length
  const consolidated = reps.filter((t) => t.salience >= floor).sort((a, b) => b.salience - a.salience)
  const dropped = before - consolidated.length

  return { consolidated, dropped, merged }
}
