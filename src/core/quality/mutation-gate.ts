/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { MutationRunSummary } from './mutation-runner.js'

/** Default minimum kill ratio to consider implementation correct (60%). */
export const DEFAULT_KILL_THRESHOLD = 0.6

export interface MutationGateResult {
  pass: boolean
  survivedCount: number
  killRatio: number
  message: string
}

/**
 * DoD gate: fails when the mutation kill ratio is below `threshold`.
 *
 * A surviving mutant means existing tests did NOT catch a behaviour change —
 * the implementation may be under-specified or incorrect.
 *
 * Pure function — no I/O.
 */
export function checkMutationKillRatio(
  summary: MutationRunSummary,
  threshold: number = DEFAULT_KILL_THRESHOLD,
): MutationGateResult {
  if (summary.total === 0) {
    return {
      pass: true,
      survivedCount: 0,
      killRatio: 0,
      message: 'No mutants generated — gate skipped (no false positive)',
    }
  }

  const killRatio = summary.score
  const survivedCount = summary.survived
  const pass = killRatio >= threshold

  const message = pass
    ? `Kill ratio ${(killRatio * 100).toFixed(1)}% ≥ ${(threshold * 100).toFixed(0)}% threshold — gate passed`
    : `Kill ratio ${(killRatio * 100).toFixed(1)}% below ${(threshold * 100).toFixed(0)}% threshold — ${survivedCount} mutant(s) survived`

  return { pass, survivedCount, killRatio, message }
}
