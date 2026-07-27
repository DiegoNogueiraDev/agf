/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Flow Index — computational "transient hypofrontality" for context dilution.
 *
 * Models the neurological flow state as a bounded forgetting controller:
 *   - Φ(t) ∈ [0,1]  — the Flow Index, an EMA over recent task outcomes.
 *   - λ_flow = λ_base + (α · Φ(t))  — dynamic decay rate (the visual sub-equation).
 *   - e^{-λ·d}  — topological-distance decay applied to graph neighbours.
 *
 * Design corrections over the naïve "exponential Φ" proposal:
 *   1. Φ is a *bounded* EMA, not an unbounded exponential — it asymptotes to 1
 *      on a success streak and never overshoots.
 *   2. Hysteresis: a single recent failure collapses Φ abruptly (default to 0),
 *      re-hydrating long-term memory. This is the "prefrontal cortex waking up".
 *   3. λ_flow stays *linear* in Φ (the user's formula); the non-linear growth is
 *      contained inside the Φ update, where it can be damped — avoiding the
 *      sawtooth instability of a raw exponential decay term.
 *
 * All functions are pure and deterministic. §ADR-deterministic-first
 */

import type { EpisodicOutcomeResult } from '../store/episodic-outcomes-store.js'

// ── Tuning ───────────────────────────────────────────────

export interface FlowTuning {
  /** EMA gain per success — fraction of the remaining gap to 1 closed each step. */
  emaGain: number
  /** Multiplier applied to Φ on a failure (0 = hard reset, the default). */
  resetFactor: number
  /** Fraction of `emaGain` applied as a damping decay on a `partial` outcome. */
  partialFactor: number
}

/**
 * Default tuning. `emaGain=0.34` gives Φ≈0.87 after ~5 consecutive successes
 * (≈ the "5 clean cycles → flow" intuition in the proposal), still strictly < 1.
 */
export const DEFAULT_FLOW_TUNING: FlowTuning = {
  emaGain: 0.34,
  resetFactor: 0.0,
  partialFactor: 0.5,
}

// ── Types ────────────────────────────────────────────────

export interface FlowState {
  /** The Flow Index Φ(t), bounded to [0,1]. */
  phi: number
  /** Count of consecutive most-recent successes (0 if the latest outcome is not a success). */
  streak: number
  /** Number of outcomes that fed the computation. */
  sampleCount: number
}

// ── Φ — the Flow Index ───────────────────────────────────

/**
 * Compute the Flow Index Φ from a task-outcome history.
 *
 * @param outcomesNewestFirst - Outcomes ordered most-recent first, matching
 *   `queryEpisodicOutcomes(...)` which is `ORDER BY created_at DESC`.
 * @param tuning - Optional overrides for the EMA / hysteresis behaviour.
 */
export function computeFlowIndex(
  outcomesNewestFirst: readonly EpisodicOutcomeResult[],
  tuning: Partial<FlowTuning> = {},
): FlowState {
  const { emaGain, resetFactor, partialFactor } = { ...DEFAULT_FLOW_TUNING, ...tuning }

  // Trailing success streak (read from the newest end).
  let streak = 0
  for (const outcome of outcomesNewestFirst) {
    if (outcome === 'success') streak += 1
    else break
  }

  // Replay oldest → newest so the most recent outcome dominates Φ.
  let phi = 0
  for (let i = outcomesNewestFirst.length - 1; i >= 0; i -= 1) {
    const outcome = outcomesNewestFirst[i]
    if (outcome === 'success') {
      phi += emaGain * (1 - phi)
    } else if (outcome === 'failure') {
      phi *= resetFactor
    } else {
      // partial — dampen without zeroing
      phi *= 1 - emaGain * partialFactor
    }
  }

  // Clamp defensively against floating-point drift.
  phi = Math.min(1, Math.max(0, phi))

  return { phi, streak, sampleCount: outcomesNewestFirst.length }
}

// ── λ_flow — the dynamic decay rate ──────────────────────

/**
 * The visual sub-equation: **λ_flow = λ_base + (α · Φ(t))**.
 *
 * Linear in Φ by design — see module header for why.
 */
export function computeLambdaFlow(phi: number, lambdaBase: number, alpha: number): number {
  return lambdaBase + alpha * phi
}

// ── e^{-λ·d} — topological decay weight ──────────────────

/**
 * Decay weight for a node at topological distance `d`: **e^{-λ·d}**.
 * Returns 1 at d=0 (the local instruction is never diluted) and decreases
 * monotonically toward 0 as λ or d grow.
 */
export function decayWeight(lambda: number, distance: number): number {
  return Math.exp(-lambda * distance)
}
