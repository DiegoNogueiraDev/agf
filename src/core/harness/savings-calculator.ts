/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Harness Savings Calculator — pure arithmetic for "tokens saved when the
 * harness blocked an action".
 *
 * Per Eduardo's spec (2026-04-30): every time the harness blocks an action
 * that would have led to a hallucination / quality drop / context loss, the
 * graph records — with real metrics — how many tokens were saved. The DB
 * lookup that turns a session id into `tokensConsumed` and the past-rows
 * average that turns a `blockType` into `baselineContinuation` live in
 * `savings-ledger.ts`. This module only combines them.
 *
 * Grounding: Hu et al. 2026 ("Memory in the Age of AI Agents"), §4 —
 * the ledger is *factual memory* (records environment events) plus
 * *experiential memory* (each savings row teaches future blocks how much
 * the next intervention is likely to save).
 */

export type SavingsSource = 'measured' | 'estimated' | 'unknown'

export interface SavingsInput {
  /** Stable identifier for the kind of block, e.g. "regression_gate". */
  blockType: string
  /**
   * Tokens already spent in the current session up to the block, summed
   * from `llm_call_ledger`. Real measurement, not estimate.
   */
  tokensConsumed: number
  /**
   * Average total tokens consumed by past completed runs that hit a block
   * of this same type. 0 when no historical sample exists.
   */
  baselineContinuation: number
  /** Number of historical samples informing baselineContinuation. */
  baselineN: number
}

export interface SavingsEstimate {
  blockType: string
  /** Tokens that would likely have been spent had the block not fired. */
  savingsTokens: number
  /** Confidence in [0, 1] derived from baseline sample size. */
  confidence: number
  /** Provenance of the estimate. */
  source: SavingsSource
  baselineN: number
}

const CONFIDENCE_FULL_AT_N = 10
const MEASURED_THRESHOLD = 3

/**
 * Compute the savings estimate. Pure: no DB, no clock, no logger.
 */
export function computeSavings(input: SavingsInput): SavingsEstimate {
  const baselineN = Math.max(0, Math.floor(input.baselineN))

  if (baselineN === 0) {
    return {
      blockType: input.blockType,
      savingsTokens: 0,
      confidence: 0,
      source: 'unknown',
      baselineN: 0,
    }
  }

  const rawSavings = input.baselineContinuation - input.tokensConsumed
  const savingsTokens = rawSavings > 0 ? rawSavings : 0
  const confidence = Math.min(1, baselineN / CONFIDENCE_FULL_AT_N)
  const source: SavingsSource = baselineN >= MEASURED_THRESHOLD ? 'measured' : 'estimated'

  return {
    blockType: input.blockType,
    savingsTokens,
    confidence,
    source,
    baselineN,
  }
}
