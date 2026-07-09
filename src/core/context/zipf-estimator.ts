/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Zipf-calibrated token estimator — a per-project chars/token ratio.
 *
 * Anchor: natural language follows Zipf / Zipf-Mandelbrot rank-frequency, and the
 * effective chars-per-token of a corpus is a property of its vocabulary (Ferrer-i-Cancho
 * & Solé derive Zipf from minimizing speaker+hearer effort). The fixed `chars/4`
 * heuristic carries ~10–15% error; calibrating the ratio from observed (chars, tokens)
 * pairs tightens budgets and cost projections without cutting content mid-stream.
 *
 * Pure & deterministic — **additive**: the default estimator (`token-ledger.estimateTokens`)
 * is untouched; callers opt in by calibrating a ratio and using it here.
 */

/** Fixed fallback chars-per-token (matches the legacy `chars/4` heuristic). */
export const DEFAULT_CHARS_PER_TOKEN = 4

export interface TokenSample {
  /** Character length of the text. */
  chars: number
  /** Actual token count reported by the provider for that text. */
  tokens: number
}

/**
 * Calibrate the chars-per-token ratio from observed samples (median of `chars/tokens`,
 * robust to outliers). Returns {@link DEFAULT_CHARS_PER_TOKEN} when no usable sample exists.
 */
export function calibrateCharsPerToken(samples: TokenSample[]): number {
  const ratios = samples
    .filter((s) => s.tokens > 0 && s.chars > 0)
    .map((s) => s.chars / s.tokens)
    .sort((a, b) => a - b)
  if (ratios.length === 0) return DEFAULT_CHARS_PER_TOKEN
  return median(ratios)
}

/** Estimate tokens for `text` using a calibrated chars-per-token ratio. Empty ⇒ 0; otherwise ≥ 1. */
export function estimateTokensCalibrated(text: string, charsPerToken: number): number {
  if (text.length === 0) return 0
  const ratio = charsPerToken > 0 ? charsPerToken : DEFAULT_CHARS_PER_TOKEN
  return Math.max(1, Math.ceil(text.length / ratio))
}

/** Median of a pre-sorted ascending array (non-empty). */
function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}
