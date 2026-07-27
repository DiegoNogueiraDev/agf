/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Brief ceiling — enforces a ≤ 500 token limit on agf brief output.
 * Truncates low-priority sections while preserving the critical pilot protocol
 * fields: intent, AC, blastRadius, notList, testWith.
 *
 * Estimate: ~4 chars/token (rough heuristic, English prose).
 */
import type { ExecutorBrief } from './executor-brief.js'

export const BRIEF_TOKEN_CEILING = 500
const CHARS_PER_TOKEN = 4

const TRUNCATED_NOTE = '[truncated — use agf brief <id> --full]'

function countChars(brief: ExecutorBrief): number {
  return [
    brief.intent,
    brief.imitate,
    brief.readTouch,
    brief.contract,
    brief.acceptanceCriteria.join(' '),
    brief.notList.join(' '),
    brief.blastRadius.join(' '),
    brief.budget,
    brief.uncertainty,
    brief.testWith,
    brief.dod.join(' '),
    brief.selfReview.join(' '),
    brief.returnSchema,
  ].join(' ').length
}

/** Estimates token count for a brief (4 chars/token heuristic). */
export function estimateBriefTokens(brief: ExecutorBrief): number {
  return Math.ceil(countChars(brief) / CHARS_PER_TOKEN)
}

export interface BriefCeilingOpts {
  full?: boolean
}

/**
 * Applies a 500-token ceiling to the brief by progressively truncating low-priority
 * sections. Order of truncation (least important first):
 *   selfReview → dod → returnSchema → budget → uncertainty → contract → imitate → readTouch
 *
 * Protected fields (never truncated): intent, acceptanceCriteria, blastRadius, notList, testWith.
 */
export function applyBriefCeiling(brief: ExecutorBrief, opts: BriefCeilingOpts = {}): ExecutorBrief {
  if (opts.full) return brief
  if (estimateBriefTokens(brief) <= BRIEF_TOKEN_CEILING) return brief

  const result: ExecutorBrief = { ...brief }

  // Truncation order: least critical → most critical
  const truncatable: Array<keyof ExecutorBrief> = [
    'selfReview',
    'dod',
    'returnSchema',
    'budget',
    'uncertainty',
    'contract',
    'imitate',
    'readTouch',
  ]

  for (const field of truncatable) {
    if (estimateBriefTokens(result) <= BRIEF_TOKEN_CEILING) break
    const value = result[field]
    if (Array.isArray(value)) {
      ;(result as unknown as Record<string, unknown>)[field] = [TRUNCATED_NOTE]
    } else if (typeof value === 'string' && value.length > 40) {
      ;(result as unknown as Record<string, unknown>)[field] = TRUNCATED_NOTE
    }
  }

  return result
}
