/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-21.T03 — stale-source-ref detector.
 * Pure function: dado timestamps + LOC counts, decide se sourceRef.file
 * mudou substancialmente desde a criação do node (PRD spec stale).
 *
 * O hook integration em builtin-handlers chama fs.statSync + readFileSync
 * para obter mtime e currentLineCount; baselineLineCount vem do node
 * metadata (registrado no insertNode quando sourceRef é definida).
 */

const DAY_MS = 24 * 60 * 60 * 1000

export const STALE_AGE_DAYS = 14
export const STALE_LOC_DELTA = 0.3

export interface StaleCheckInput {
  createdAtMs: number
  mtimeMs: number
  currentLineCount: number
  /** Recorded line count at node creation; absent → cannot detect drift. */
  baselineLineCount?: number
}

export interface StaleCheckOptions {
  minAgeDays?: number
  locDeltaThreshold?: number
}

export interface StaleCheckResult {
  stale: boolean
  ageDays: number
  locDelta: number
  reason?: string
}

/** detectStaleSourceRef —  */
export function detectStaleSourceRef(input: StaleCheckInput, opts: StaleCheckOptions = {}): StaleCheckResult {
  const minAgeDays = opts.minAgeDays ?? STALE_AGE_DAYS
  const locDeltaThreshold = opts.locDeltaThreshold ?? STALE_LOC_DELTA

  const ageMs = Math.max(0, input.mtimeMs - input.createdAtMs)
  const ageDays = ageMs / DAY_MS

  if (input.baselineLineCount === undefined) {
    return { stale: false, ageDays, locDelta: 0 }
  }
  if (input.baselineLineCount <= 0) {
    return { stale: false, ageDays, locDelta: 0 }
  }

  const locDelta = Math.abs(input.currentLineCount - input.baselineLineCount) / input.baselineLineCount

  if (ageDays > minAgeDays && locDelta > locDeltaThreshold) {
    return {
      stale: true,
      ageDays,
      locDelta,
      reason: `file aged ${ageDays.toFixed(1)}d with ${(locDelta * 100).toFixed(0)}% LOC drift`,
    }
  }
  return { stale: false, ageDays, locDelta }
}
