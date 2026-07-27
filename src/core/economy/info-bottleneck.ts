/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Information Bottleneck accept objective for lossy compression.
 *
 * Anchor: Tishby, Pereira & Bialek (1999) Information Bottleneck — find a compressed
 * representation `T` of `X` that maximizes `β·I(T;Y) − I(X;T)`: squeeze the input
 * while keeping what predicts the target `Y`. Biological echo: Barlow's efficient
 * coding (the retina compresses ~100M photoreceptors to ~1M fibres, keeping the
 * behaviorally relevant signal). Replaces the ad-hoc `saved > threshold` rule with a
 * principled tradeoff: accept a compression only when its token reduction outweighs
 * `β` times the predictive-information it destroys.
 *
 * Pure & deterministic — **additive**: the lossy-gate / calibrate defaults are
 * untouched; they opt in by scoring candidates here.
 */

/** Default fidelity weight β (how much predictive-info loss is penalised vs token savings). */
export const DEFAULT_BETA = 2

export interface CompressionCandidate {
  /** Token count before compression. */
  tokensBefore: number
  /** Token count after compression. */
  tokensAfter: number
  /** Fraction of task-predictive information retained, in [0, 1] (1 = lossless meaning). */
  retainedInfo: number
  /** Fidelity weight β. Default {@link DEFAULT_BETA}. */
  beta?: number
}

export interface AcceptOptions {
  /** Minimum IB score to accept. Default 0 (compression must at least break even). */
  threshold?: number
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

/**
 * IB Lagrangian proxy: `compressionRate − β·infoLoss`, where
 * `compressionRate = 1 − after/before` (↓ I(X;T)) and `infoLoss = 1 − retainedInfo` (↓ I(T;Y)).
 * Positive ⇒ the squeeze is worth its predictive-information cost.
 */
export function informationBottleneckScore(candidate: CompressionCandidate): number {
  const beta = candidate.beta ?? DEFAULT_BETA
  const compressionRate = candidate.tokensBefore > 0 ? clamp01(1 - candidate.tokensAfter / candidate.tokensBefore) : 0
  const infoLoss = 1 - clamp01(candidate.retainedInfo)
  return compressionRate - beta * infoLoss
}

/** Accept a compression candidate when its IB score meets the threshold (default break-even). */
export function shouldAcceptCompression(candidate: CompressionCandidate, opts: AcceptOptions = {}): boolean {
  return informationBottleneckScore(candidate) >= (opts.threshold ?? 0)
}

// ── tokenRecall proxy — turns raw before/after text into a retainedInfo estimate ─

/** Distinct, lowercased, alphanumeric word tokens in a string (Unicode-aware). */
export function distinctWordTokens(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
}

/**
 * tokenRecall — the fraction of `before`'s distinct word tokens that survive in
 * `after`, in [0, 1]. A cheap, deterministic proxy for I(T;Y): if the words that
 * carry the task signal (AC keywords, identifiers) are dropped, recall falls.
 * Empty source ⇒ 1 (nothing to lose).
 */
export function tokenRecall(before: string, after: string): number {
  const beforeTokens = distinctWordTokens(before)
  if (beforeTokens.size === 0) return 1
  const afterTokens = distinctWordTokens(after)
  let kept = 0
  for (const tok of beforeTokens) if (afterTokens.has(tok)) kept++
  return kept / beforeTokens.size
}

/** Options for {@link acceptTextCompression}. */
export interface TextCompressionGateOptions {
  /** Fidelity weight β. Default {@link DEFAULT_BETA}. */
  beta?: number
  /** Minimum IB score to accept. Default 0 (break-even). */
  threshold?: number
  /** Token estimator; defaults to a ~4-chars/token heuristic. Inject the project's for consistency. */
  estimateTokens?: (text: string) => number
}

/**
 * Gate a raw text compression through the IB objective, using {@link tokenRecall}
 * as the retained-info proxy. Returns true when the squeeze is worth its
 * predictive-information cost. This is the one-call entry point the context
 * packers use to reject lossy compressions.
 */
export function acceptTextCompression(before: string, after: string, opts: TextCompressionGateOptions = {}): boolean {
  const estimate = opts.estimateTokens ?? ((text: string): number => Math.ceil(text.length / 4))
  return shouldAcceptCompression(
    {
      tokensBefore: estimate(before),
      tokensAfter: estimate(after),
      retainedInfo: tokenRecall(before, after),
      beta: opts.beta,
    },
    { threshold: opts.threshold },
  )
}
