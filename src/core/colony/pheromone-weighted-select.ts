/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

export interface Candidate {
  id: string
  priority: number // 1 = highest priority
  size: number // 1 = small, 2 = medium, 3 = large
  pheromone: number // τ ≥ 0
  // Optional desirability signals (T1) — fold into η so --aco stops throwing away what
  // findNextTask already computes. Omitted → η reduces to the base 1/(priority·size).
  blockingImpact?: number // # of downstream tasks this one unblocks (≥ 0)
  acCount?: number // # of acceptance criteria (testability signal, ≥ 0)
}

export interface SelectionWeights {
  alpha: number // pheromone importance exponent
  beta: number // heuristic importance exponent
}

export type RNG = () => number // must return a value in [0, 1)

// Weight of one extra acceptance criterion in the η numerator. Kept small so AC-count is a
// mild tie-breaker, never dominating blocking-impact or priority. Blocking-impact weight is 1.
const AC_DESIRABILITY_WEIGHT = 0.25

// Desirability η(i) = (1 + blockingImpact + AC_WEIGHT·acCount) / (priority · size).
// Higher when the task unblocks more work, carries more testable AC, is higher priority, or
// smaller. Readiness is not a factor here: the caller (findUnblockedTasks) only ever passes
// ready candidates, so it is uniform. With both optional signals absent this is exactly the
// original 1/(priority·size) — backward-compatible.
export function desirability(c: Candidate): number {
  const numerator = 1 + (c.blockingImpact ?? 0) + AC_DESIRABILITY_WEIGHT * (c.acCount ?? 0)
  return numerator / (c.priority * c.size)
}

// Roulette-wheel selection using ACO formula P(i) = τ_i^α · η_i^β / Σ(τ_j^α · η_j^β)
export function pheromoneWeightedSelect(
  candidates: readonly Candidate[],
  weights: SelectionWeights,
  rng: RNG,
): Candidate | null {
  if (candidates.length === 0) return null

  const { alpha, beta } = weights

  const scores = candidates.map((c) => {
    // 0^0 = 1 in JS, which correctly ignores pheromone when alpha=0
    const tauTerm = Math.pow(c.pheromone, alpha)
    const etaTerm = Math.pow(desirability(c), beta)
    return tauTerm * etaTerm
  })

  const total = scores.reduce((s, v) => s + v, 0)
  if (total === 0) return null

  let threshold = rng() * total
  for (let i = 0; i < candidates.length; i++) {
    threshold -= scores[i]!
    if (threshold < 0) return candidates[i]!
  }

  // Floating-point safety: return last candidate if threshold never crossed zero
  return candidates[candidates.length - 1]!
}
