/*!
 * Context health score — rates session context quality 0-100.
 * Task node_94f1e5aff5af.
 *
 * WHY: Long autopilot runs accumulate stale, low-relevance messages. The health
 * score surfaces degradation early so compression can be triggered proactively
 * rather than reactively (overflow-detection.ts handles the reactive path).
 *
 * Dimensions (equal weight, normalized 0-1 each):
 *   - size:      inverse of context fill ratio (1 = empty, 0 = at limit)
 *   - freshness: fraction of messages that are recent (within tail window)
 *   - relevance: proxy via assistant/user turn ratio (balanced = healthy)
 *
 * Contract: pure function, never throws, returns score in [0, 100].
 * Composes with: overflow-detection.ts (reactive), autopilot-context-guard.ts (proactive).
 */

import { estimateTokens } from './token-estimator.js'

const MAX_CONTEXT_TOKENS = 200_000
const OVERFLOW_THRESHOLD = 0.8
const TAIL_RATIO = 0.25
const SUGGEST_THRESHOLD = 50

export interface ContextHealthDimensions {
  /** Inverse fill ratio: 1 = empty context, 0 = full. */
  size: number
  /** Fraction of messages in the recent tail window. */
  freshness: number
  /** Balance of assistant/user turns (1 = balanced, 0 = skewed). */
  relevance: number
}

export interface ContextHealthReport {
  /** Overall health score 0-100. Higher is better. */
  score: number
  dimensions: ContextHealthDimensions
  /** True when score < SUGGEST_THRESHOLD — caller should consider compression. */
  suggestCompression: boolean
}

export function computeContextHealthScore(
  messages: Array<{ role: string; content: string; createdAt?: number }>,
): ContextHealthReport {
  if (messages.length === 0) {
    return {
      score: 100,
      dimensions: { size: 1, freshness: 1, relevance: 1 },
      suggestCompression: false,
    }
  }

  const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0)
  const fillRatio = totalTokens / MAX_CONTEXT_TOKENS
  const sizeScore = Math.max(0, 1 - fillRatio / OVERFLOW_THRESHOLD)

  const tailBudget = MAX_CONTEXT_TOKENS * TAIL_RATIO
  let tailTokens = 0
  let tailCount = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    const t = estimateTokens(messages[i].content)
    if (tailTokens + t > tailBudget) break
    tailTokens += t
    tailCount++
  }
  const freshnessScore = messages.length > 0 ? tailCount / messages.length : 1

  const assistantCount = messages.filter((m) => m.role === 'assistant').length
  const userCount = messages.length - assistantCount
  const total = assistantCount + userCount
  const ratio = total > 0 ? Math.min(assistantCount, userCount) / Math.max(assistantCount, userCount, 1) : 1
  const relevanceScore = ratio

  const score = Math.round(((sizeScore + freshnessScore + relevanceScore) / 3) * 100)

  const dimensions: ContextHealthDimensions = {
    size: sizeScore,
    freshness: freshnessScore,
    relevance: relevanceScore,
  }

  return {
    score,
    dimensions,
    suggestCompression: score < SUGGEST_THRESHOLD,
  }
}
