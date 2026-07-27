/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 agentmemory contributors
 * Copyright © 2026 Diego Lima Nogueira de Paula (TypeScript port and changes)
 *
 * Ported from agentmemory (https://github.com/rohitg00/agentmemory), Apache-2.0.
 * See THIRD-PARTY-NOTICES.md.
 */

export interface RetentionConfig {
  lambda: number
  sigma: number
}

export interface TierThresholds {
  hot: number
  warm: number
  cold: number
}

export type MemoryTier = 'hot' | 'warm' | 'cold' | 'expired'

export const DEFAULT_DECAY: RetentionConfig = {
  lambda: 0.01,
  sigma: 0.3,
}

export const DEFAULT_THRESHOLDS: TierThresholds = {
  hot: 0.7,
  warm: 0.4,
  cold: 0.15,
}

/** Compute a time-decayed retention score using exponential decay: `score × e^(-λ × ageDays)`. */
export function computeRetentionScore(
  originalScore: number,
  ageDays: number,
  config: RetentionConfig = DEFAULT_DECAY,
): number {
  return originalScore * Math.exp(-config.lambda * ageDays)
}

/** Classify a retention score into hot/warm/cold tier based on configurable thresholds. */
export function classifyTier(score: number, thresholds: TierThresholds = DEFAULT_THRESHOLDS): MemoryTier {
  if (score >= thresholds.hot) return 'hot'
  if (score >= thresholds.warm) return 'warm'
  if (score >= thresholds.cold) return 'cold'
  return 'expired'
}
