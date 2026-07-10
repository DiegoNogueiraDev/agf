/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-6.T09 — Tier router (dispatches across Tier 0/1/2).
 *
 * Tier 0: try a deterministic booster (regex/AST). On hit, return without
 * touching an LLM.
 * Tier 1: pick Haiku for small budgets, Sonnet for medium.
 * Tier 2: always Opus.
 *
 * Pure dispatch — caller injects booster + LLM facade. We just choose the
 * model name and decide whether to skip the LLM entirely.
 */

import type { Tier } from './complexity-classifier.js'

export const HAIKU = 'haiku'
export const SONNET = 'sonnet'
export const OPUS = 'opus'

export const SONNET_MIN_TOKENS = 8000

export type ModelName = typeof HAIKU | typeof SONNET | typeof OPUS

export interface BoosterResult<T> {
  hit: boolean
  output?: T
  reason?: string
}

export interface TierRouterInput<T> {
  tier: Tier
  tokenBudget?: number
  /** Tier 0 attempt. Caller decides what counts as a hit. */
  booster?: () => BoosterResult<T>
}

export interface TierDispatch<T> {
  tier: Tier
  model: ModelName | null
  boosterOutput?: T
  reason: string
}

/** pickTier1Model —  */
export function pickTier1Model(tokenBudget: number | undefined): ModelName {
  return (tokenBudget ?? 0) >= SONNET_MIN_TOKENS ? SONNET : HAIKU
}

/** dispatchTier —  */
export function dispatchTier<T>(input: TierRouterInput<T>): TierDispatch<T> {
  if (input.tier === 'tier0') {
    if (!input.booster) {
      return { tier: 'tier0', model: null, reason: 'tier0-no-booster' }
    }
    const resultValue = input.booster()
    if (resultValue.hit && resultValue.output !== undefined) {
      return {
        tier: 'tier0',
        model: null,
        boosterOutput: resultValue.output,
        reason: resultValue.reason ?? 'tier0-booster-hit',
      }
    }
    // Booster missed → escalate to tier 1.
    const detail = resultValue.reason ?? 'tier0-booster-miss'
    return {
      tier: 'tier1',
      model: pickTier1Model(input.tokenBudget),
      reason: `${detail} → tier1`,
    }
  }

  if (input.tier === 'tier1') {
    return {
      tier: 'tier1',
      model: pickTier1Model(input.tokenBudget),
      reason: 'tier1',
    }
  }

  // tier2
  return { tier: 'tier2', model: OPUS, reason: 'tier2' }
}
