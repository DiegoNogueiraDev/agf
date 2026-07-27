/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Computes pheromone deposit strength from task outcome signals.
 *
 * In delegated mode (tokens_saved = 0) the colony still gets a non-zero
 * reinforcement signal when harness or AC quality improved — preventing
 * trails from being purely decorative (placebo).
 *
 * Pure function — no I/O.
 */

export interface RewardSignals {
  /** Tokens saved vs baseline; 0 in fully-delegated mode. */
  tokensSaved: number
  /** Net change in harness score (positive = improvement). */
  harnessDelta: number
  /** Whether all acceptance criteria passed for this task. */
  acPass: boolean
  /** Elapsed task time in milliseconds; 0 or negative means unknown. */
  cycleTimeMs: number
}

const W_TOKENS = 0.3
const W_HARNESS = 0.4
const W_AC = 0.2

/** Tasks faster than this get a speed bonus (max +10%). */
const TARGET_CYCLE_MS = 2 * 60 * 60 * 1000

/**
 * Returns the pheromone deposit amount for a completed task.
 *
 * - `tokensSaved` contributes linearly (100 tokens → 0.30 strength)
 * - `harnessDelta` contributes only when positive (10 pts → 0.40 strength)
 * - `acPass` adds a fixed quality signal when true
 * - `cycleTimeMs` adds a speed bonus (up to +10%) only when base > 0
 *
 * Returns exactly 0 when no positive signal is present (AC2).
 */
export function computeRewardStrength(signals: RewardSignals): number {
  const tokenComponent = (Math.max(0, signals.tokensSaved) / 100) * W_TOKENS
  const qualityComponent = signals.harnessDelta > 0 ? (signals.harnessDelta / 10) * W_HARNESS : 0
  const acComponent = signals.acPass ? W_AC : 0

  const base = tokenComponent + qualityComponent + acComponent
  if (base === 0) return 0

  const speedBonus =
    signals.cycleTimeMs > 0 && signals.cycleTimeMs < TARGET_CYCLE_MS
      ? 0.1 * (1 - signals.cycleTimeMs / TARGET_CYCLE_MS)
      : 0

  return base + base * speedBonus
}
