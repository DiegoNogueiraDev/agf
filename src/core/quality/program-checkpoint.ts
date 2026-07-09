/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export interface CheckpointData {
  tasksCompleted: number
  harnessDelta: number | null
  qualityDelta: number | null
  comparedToBaseline: boolean
  warning?: string
}

export function shouldEmitCheckpoint(tasksCompleted: number): boolean {
  return tasksCompleted > 0 && tasksCompleted % 10 === 0
}

export function computeProgramCheckpoint(
  tasksCompleted: number,
  currentHarness: number | null,
  baselineHarness: number | null,
  currentQuality?: number,
  baselineQuality?: number,
): CheckpointData | null {
  if (!shouldEmitCheckpoint(tasksCompleted)) return null

  const hasBaseline = currentHarness !== null && baselineHarness !== null

  if (!hasBaseline) {
    return {
      tasksCompleted,
      harnessDelta: null,
      qualityDelta: null,
      comparedToBaseline: false,
      warning: 'No baseline captured. Run agf harness to capture a baseline (Task 1.1).',
    }
  }

  const harnessDelta = currentHarness! - baselineHarness!
  const qualityDelta =
    currentQuality !== undefined && baselineQuality !== undefined ? currentQuality - baselineQuality : null

  const result: CheckpointData = {
    tasksCompleted,
    harnessDelta,
    qualityDelta,
    comparedToBaseline: true,
  }

  if (harnessDelta < 0) {
    result.warning = `Regression detected: harness dropped ${Math.abs(harnessDelta)} points from baseline.`
  }

  return result
}
