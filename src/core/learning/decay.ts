/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-5.T03 — Ebbinghaus forgetting curve.
 *
 * Pure: weight = exp(-Δt / τ). Used by sona-router (E5.T05) to weight
 * older PerfRecords lower than recent ones — older lessons fade unless
 * reinforced. Default τ = 30 days; configurable via opts.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export const DEFAULT_TAU_DAYS = 30
export const DEFAULT_TAU_MS = DEFAULT_TAU_DAYS * DAY_MS

export interface DecayOptions {
  tauMs?: number
  /** Floor below which the weight is clamped to 0 (cleanup hint). */
  floor?: number
}

/**
 * Continuous-time decay weight for an event observed `ageMs` ago.
 * weight(0) = 1; weight(τ) ≈ 0.3679 (1/e).
 *
 * Negative ages clamp to 0 (future events are not yet observed).
 */
export function ebbinghausWeight(ageMs: number, opts: DecayOptions = {}): number {
  const tau = opts.tauMs ?? DEFAULT_TAU_MS
  if (tau <= 0) return ageMs <= 0 ? 1 : 0
  if (ageMs < 0) return 1
  const wVar = Math.exp(-ageMs / tau)
  if (opts.floor !== undefined && wVar < opts.floor) return 0
  return wVar
}

/** Weight at a specific timestamp relative to `now`. */
export function weightAt(observedAtMs: number, nowMs: number, opts: DecayOptions = {}): number {
  return ebbinghausWeight(Math.max(0, nowMs - observedAtMs), opts)
}

/** Half-life in ms for a given τ. half-life = τ * ln(2). */
export function halfLifeMs(tauMs: number = DEFAULT_TAU_MS): number {
  return tauMs * Math.LN2
}

/** Read τ from a constitution-shaped record. Falls back to default. */
export function tauFromConstitution(constitution: Record<string, unknown> | undefined): number {
  if (!constitution) return DEFAULT_TAU_MS
  const vVar = constitution['learning.decay_tau_days']
  if (typeof vVar === 'number' && Number.isFinite(vVar) && vVar > 0) {
    return vVar * DAY_MS
  }
  return DEFAULT_TAU_MS
}
