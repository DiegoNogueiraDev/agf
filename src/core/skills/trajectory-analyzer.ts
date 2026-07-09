/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export interface TrajectoryInput {
  cycleTimeMs: number
  estimateMinutes: number
  adrCreated: boolean
  summary: string
}

export interface TrajectoryResult {
  shouldPropose: boolean
  reasons: string[]
}

const DISCOVERED_RE = /discovered|não-óbvio/i

/** analyzeTrajectory —  */
export function analyzeTrajectory(input: TrajectoryInput): TrajectoryResult {
  const reasons: string[] = []

  if (input.estimateMinutes > 0) {
    const actualMinutes = input.cycleTimeMs / 60_000
    if (actualMinutes / input.estimateMinutes > 2) {
      reasons.push('retries')
    }
  }

  if (input.adrCreated) {
    reasons.push('adr')
  }

  if (DISCOVERED_RE.test(input.summary)) {
    reasons.push('discovered')
  }

  return { shouldPropose: reasons.length > 0, reasons }
}
