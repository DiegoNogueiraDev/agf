/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'

export const EvalScoreSchema = z.object({
  correctness: z.number().min(0).max(1),
  ac_coverage: z.number().min(0).max(1),
  token_cost_usd: z.number().min(0),
  latency_ms: z.number().min(0),
  hallucination_count: z.int().min(0),
})

export type EvalScore = z.infer<typeof EvalScoreSchema>

export interface QualityResult {
  qualityScore: number
  isDegrade: boolean
}

const QUALITY_THRESHOLD = 0.8

/** Compute a quality verdict from an eval score — averages correctness and AC coverage against QUALITY_THRESHOLD. */
export function computeQualityScore(score: EvalScore): QualityResult {
  const qualityScore = (score.correctness + score.ac_coverage) / 2
  return {
    qualityScore,
    isDegrade: qualityScore < QUALITY_THRESHOLD,
  }
}
