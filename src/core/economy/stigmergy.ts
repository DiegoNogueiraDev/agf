/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Stigmergy — pheromone trails over graph keys with exponential evaporation.
 *
 * Anchor: Grassé's stigmergy; Dorigo's Ant Colony Optimization. Ants coordinate
 * indirectly through the environment: successful (shorter) paths are traversed more
 * often and accumulate pheromone, while stale trails **evaporate exponentially**
 * `e^{-λt}` (same decay family as the Flow engine's topological decay). A driving
 * agent can deposit a compact marker on edges/nodes that worked, and the next task
 * reads the strongest trail (~tiny tokens) instead of re-deriving context.
 *
 * Pure & deterministic given timestamps. Token lever `stigmergy`.
 */

import { McpGraphError } from '../utils/errors.js'

export interface PheromoneOptions {
  /** Time for a trail to evaporate to half strength. Decay λ = ln(2)/halfLifeMs. */
  halfLifeMs: number
  /** Strengths below this are treated as gone (strongest() ignores them). Default 1e-3. */
  epsilon?: number
}

interface TrailState {
  amount: number
  ts: number
}

export class PheromoneTrail {
  private readonly lambda: number
  private readonly epsilon: number
  private readonly trails = new Map<string, TrailState>()

  constructor(opts: PheromoneOptions) {
    if (!(opts.halfLifeMs > 0))
      throw new McpGraphError(`PheromoneTrail: halfLifeMs must be positive (got ${opts.halfLifeMs})`)
    this.lambda = Math.LN2 / opts.halfLifeMs
    this.epsilon = opts.epsilon ?? 1e-3
  }

  /** Reinforce a trail: evaporate to `nowMs`, then add `amount`. */
  deposit(key: string, amount = 1, nowMs: number = Date.now()): void {
    const decayed = this.evaporated(key, nowMs)
    this.trails.set(key, { amount: decayed + amount, ts: nowMs })
  }

  /** Current evaporated strength of a trail at `nowMs`. */
  strength(key: string, nowMs: number = Date.now()): number {
    return this.evaporated(key, nowMs)
  }

  /** The strongest trail among `keys` (or all known) at `nowMs`, or null if all below epsilon. */
  strongest(keys?: string[], nowMs: number = Date.now()): { key: string; strength: number } | null {
    const candidates = keys ?? [...this.trails.keys()]
    let best: { key: string; strength: number } | null = null
    for (const key of candidates) {
      const s = this.evaporated(key, nowMs)
      if (s >= this.epsilon && (best === null || s > best.strength)) best = { key, strength: s }
    }
    return best
  }

  private evaporated(key: string, nowMs: number): number {
    const state = this.trails.get(key)
    if (!state) return 0
    const dt = Math.max(0, nowMs - state.ts)
    return state.amount * Math.exp(-this.lambda * dt)
  }
}
