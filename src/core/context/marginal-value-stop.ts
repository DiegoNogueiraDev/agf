/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Marginal-value retrieval stop rule — optimal-foraging "patch-leaving".
 *
 * Anchor: Charnov's Marginal Value Theorem (1976); Stephens & Krebs foraging theory.
 * A forager leaves a patch when its instantaneous intake rate drops to the average
 * rate of the whole habitat. Here each ranked candidate is a "patch" with an
 * information `gain` and a `tokens` cost; we keep candidates whose marginal rate
 * `gain/tokens` is at least the habitat-average rate, then stop — spending tokens
 * only while they beat the average return, instead of filling a fixed budget.
 *
 * Pure & deterministic. Candidates are assumed ranked best-first (as retrieval returns).
 */

export interface ValueItem {
  /** Information gain of this candidate (any positive scale). */
  gain: number
  /** Token cost of including it. */
  tokens: number
}

export interface MarginalValueOptions {
  /** Always take at least this many candidates (even if below the habitat average). Default 1. */
  minItems?: number
}

export interface MarginalValueResult {
  /** Number of candidates taken from the front of the ranked list. */
  takenCount: number
  /** Indices (into the input) that were taken. */
  takenIndices: number[]
}

/**
 * Keep ranked candidates while their marginal rate beats the habitat-average rate,
 * then stop (MVT patch-leaving). Always keeps at least `minItems`.
 */
export function selectByMarginalValue(items: ValueItem[], opts: MarginalValueOptions = {}): MarginalValueResult {
  const minItems = Math.max(0, opts.minItems ?? 1)
  if (items.length === 0) return { takenCount: 0, takenIndices: [] }

  const totalGain = items.reduce((a, it) => a + it.gain, 0)
  const totalTokens = items.reduce((a, it) => a + Math.max(0, it.tokens), 0)
  const habitatRate = totalTokens > 0 ? totalGain / totalTokens : 0

  const takenIndices: number[] = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const rate = it.tokens > 0 ? it.gain / it.tokens : Infinity
    if (i >= minItems && rate < habitatRate) break
    takenIndices.push(i)
  }

  return { takenCount: takenIndices.length, takenIndices }
}
