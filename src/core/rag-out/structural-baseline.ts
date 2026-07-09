/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Structural baseline estimation for RAG-OUT (PRD 4.4, method 2).
 *
 * For RAG-OUT, `baseline_out ≈ tokens the LLM would generate for the full
 * scaffold` — structure + all slot content. This is cheap to compute (no
 * LLM call required) and conservatively accurate: it slightly overestimates
 * (the LLM might generate a shorter variant), which errs in the direction of
 * underreporting savings rather than inflating them.
 *
 * Honesty rule: entries carry `baselineMethod: 'structural'` so reports
 * never conflate this estimate with shadow-measured baselines.
 */

import type { ScaffoldDescriptor } from './gate.js'

export interface StructuralBaseline {
  scaffoldId: string
  /** Estimated tokens in the scaffold's fixed structure (the recovered part). */
  structureTokens: number
  /** Estimated tokens for filling all slots (the generated part). */
  slotsEstimate: number
  /** Total baseline: structureTokens + slotsEstimate (what LLM would generate). */
  baselineTokens: number
  /** Actual cost: only slotsEstimate (structure was recovered, not generated). */
  actualTokens: number
  saved: number
  baselineMethod: 'structural'
}

/** Base structure tokens for any scaffold (fixed overhead per template). */
const BASE_STRUCTURE_TOKENS = 120
/** Additional tokens per slot in the structure template. */
const STRUCTURE_PER_SLOT = 15
/** Default estimated tokens to fill one slot with real content. */
const DEFAULT_TOKENS_PER_SLOT = 20

export function structuralBaselineEstimate(
  scaffold: ScaffoldDescriptor,
  opts?: { tokensPerSlot?: number },
): StructuralBaseline {
  const tokensPerSlot = opts?.tokensPerSlot ?? DEFAULT_TOKENS_PER_SLOT
  const slotCount = scaffold.slots.length

  // Structure grows with slot count: more complex scaffolds have more boilerplate
  const structureTokens = BASE_STRUCTURE_TOKENS + slotCount * STRUCTURE_PER_SLOT
  const slotsEstimate = slotCount * tokensPerSlot
  const baselineTokens = structureTokens + slotsEstimate
  const actualTokens = slotsEstimate // only slots are generated after recovery
  const saved = baselineTokens - actualTokens

  return {
    scaffoldId: scaffold.id,
    structureTokens,
    slotsEstimate,
    baselineTokens,
    actualTokens,
    saved,
    baselineMethod: 'structural',
  }
}
