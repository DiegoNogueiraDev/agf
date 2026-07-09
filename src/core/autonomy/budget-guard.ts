/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * B5 — Budget guard: a hard token/cost ceiling + kill-switch for parallel
 * fan-out. By default (no ceiling) it is unbounded — a no-op that preserves the
 * current serial/single-loop behavior. Only when a ceiling is configured does
 * it engage and report `exceeded()` once spend reaches the cap.
 */

import { emitEconomyHook } from '../hooks/economy-lifecycle-hooks.js'

export interface BudgetGuard {
  /** Accumulate tokens spent. Non-positive amounts are ignored (defensive). */
  add(tokens: number): void
  /** Total tokens accumulated so far. */
  spent(): number
  /** Tokens left before the ceiling — `Infinity` when there is no ceiling. */
  remaining(): number
  /** True once `spent() >= maxTokens`; always false when there is no ceiling. */
  exceeded(): boolean
}

/**
 * Create a budget guard. Pass `maxTokens` to engage the ceiling; omit it (the
 * default) for unbounded behavior identical to running without any guard.
 */
export function createBudgetGuard(maxTokens?: number): BudgetGuard {
  const ceiling = typeof maxTokens === 'number' && Number.isFinite(maxTokens) ? maxTokens : undefined
  let used = 0
  let warned = false

  return {
    add(tokens: number): void {
      if (typeof tokens === 'number' && tokens > 0) {
        used += tokens
        // Dispara on_budget_warning uma única vez ao cruzar 80% do teto.
        if (ceiling !== undefined && !warned && used >= 0.8 * ceiling) {
          warned = true
          emitEconomyHook('on_budget_warning', { used, ceiling, ratio: used / ceiling })
        }
      }
    },
    spent(): number {
      return used
    },
    remaining(): number {
      if (ceiling === undefined) return Infinity
      return Math.max(0, ceiling - used)
    },
    exceeded(): boolean {
      if (ceiling === undefined) return false
      return used >= ceiling
    },
  }
}
