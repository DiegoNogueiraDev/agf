/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * RAG threshold calibration — closes the telemetry loop (PRD 4.6).
 *
 * `ledger → report → "score band X economizes little and errs" → raise the gate
 * threshold → next cycle: measure again`. The signal is `rerank_score × saved`:
 * bands of confidence where retrieval does NOT pay (low mean saving and/or low
 * acceptance) should sit *below* the recommended threshold, so future retrievals
 * in that band fall through to generation instead.
 *
 * Pure and deterministic — no DB, no clock. The CLI feeds it ledger rows.
 */

export interface CalibrationEvent {
  /** Gate confidence at decision time; null rows are ignored (cannot be banded). */
  score: number | null
  saved: number
  accepted: boolean
}

export interface CalibrationBand {
  lo: number
  hi: number
  count: number
  meanSaved: number
  acceptanceRate: number
  /** Whether this band pays (positive mean saving and healthy acceptance). */
  pays: boolean
}

export interface CalibrationResult {
  recommended: number
  bands: CalibrationBand[]
  reason: string
}

export interface CalibrateOptions {
  defaultThreshold?: number
  bandWidth?: number
  /** Minimum acceptance for a band to count as "paying". */
  minAcceptance?: number
  /** Minimum mean saved for a band to count as "paying". */
  minMeanSaved?: number
}

const DEFAULT_BAND_WIDTH = 0.2
const DEFAULT_MIN_ACCEPTANCE = 0.5
const DEFAULT_MIN_MEAN_SAVED = 1

export function calibrateThreshold(
  events: readonly CalibrationEvent[],
  opts: CalibrateOptions = {},
): CalibrationResult {
  const defaultThreshold = opts.defaultThreshold ?? 0.5
  const width = opts.bandWidth ?? DEFAULT_BAND_WIDTH
  const minAcc = opts.minAcceptance ?? DEFAULT_MIN_ACCEPTANCE
  const minSaved = opts.minMeanSaved ?? DEFAULT_MIN_MEAN_SAVED

  const scored = events.filter((e): e is CalibrationEvent & { score: number } => typeof e.score === 'number')
  if (scored.length === 0) {
    return { recommended: defaultThreshold, bands: [], reason: 'insufficient_data' }
  }

  // Bucket [0,1) into bands of `width`.
  const nBands = Math.max(1, Math.ceil(1 / width))
  const buckets: CalibrationEvent[][] = Array.from({ length: nBands }, () => [])
  for (const e of scored) {
    const idx = Math.min(nBands - 1, Math.floor((e.score as number) / width))
    buckets[idx]!.push(e)
  }

  const bands: CalibrationBand[] = buckets
    .map((rows, i) => {
      const lo = Number((i * width).toFixed(4))
      const hi = Number(Math.min(1, (i + 1) * width).toFixed(4))
      if (rows.length === 0) return { lo, hi, count: 0, meanSaved: 0, acceptanceRate: 0, pays: false }
      const meanSaved = rows.reduce((s, r) => s + r.saved, 0) / rows.length
      const acceptanceRate = rows.filter((r) => r.accepted).length / rows.length
      const pays = meanSaved >= minSaved && acceptanceRate >= minAcc
      return { lo, hi, count: rows.length, meanSaved, acceptanceRate, pays }
    })
    .filter((b) => b.count > 0)

  // Recommended threshold = lo of the lowest band that pays. If none pays, keep
  // the highest band's lo (be conservative) or default if that is lower.
  const payingBands = bands.filter((b) => b.pays).sort((a, b) => a.lo - b.lo)
  if (payingBands.length > 0) {
    return {
      recommended: payingBands[0]!.lo,
      bands,
      reason: `lowest_paying_band@${payingBands[0]!.lo}`,
    }
  }

  const highestLo = bands.reduce((mx, b) => Math.max(mx, b.lo), 0)
  return {
    recommended: Math.max(defaultThreshold, highestLo),
    bands,
    reason: 'no_paying_band_raise_conservative',
  }
}
