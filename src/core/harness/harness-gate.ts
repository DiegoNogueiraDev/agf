/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 *
 * need a boolean pass/fail + violation list without repeating the threshold logic.
 * Extracted so CI scripts and tests can stub runHarnessScan independently.
 *
 * Composing: harness-scan-runner → harness-gate → harness-cmd (--gate flag) → CI.
 */

import { runHarnessScan } from './harness-scan-runner.js'
import type { ViolationDetail } from './violation-detail.js'

export interface FitnessGateOptions {
  /** Minimum fitness percentage to pass. Default: 100 */
  threshold?: number
}

export interface FitnessGateResult {
  pass: boolean
  fitnessScore: number
  threshold: number
  violations: ViolationDetail[]
}

/**
 * Check architecture fitness against a threshold.
 * Returns pass:false + violations when fitnessScore < threshold.
 */
export function checkArchitectureFitness(dir: string, opts: FitnessGateOptions = {}): FitnessGateResult {
  const threshold = opts.threshold ?? 100
  const scan = runHarnessScan(dir, undefined, undefined, { collectViolations: true, maxViolations: 50 })
  const fitnessScore = scan.breakdown.fitness.score
  const violations: ViolationDetail[] = (scan.violations ?? []).filter((v) => v.dimension === 'fitness')
  return {
    pass: fitnessScore >= threshold,
    fitnessScore,
    threshold,
    violations,
  }
}
