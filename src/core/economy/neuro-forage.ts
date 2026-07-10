/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * NeuroForaging — composite retrieval-stop rule: heat-kernel diffusion (e^{-tL})
 * weights gains, MVT (Charnov) decides the cutoff, epsilon-greedy (Sutton & Barto)
 * explores a low-ranked alternative.
 *
 * Anchors:
 * - Heat kernel: Kondor & Lafferty (2002) diffusion kernels on graphs
 * - MVT: Charnov (1976) Marginal Value Theorem
 * - Epsilon-greedy: Sutton & Barto (2018) Reinforcement Learning (ch. 2)
 *
 * Biological echo: foraging animals use spatial memory (hippocampal place cells)
 * to recall which patches yielded food, estimate their current intake rate, and
 * occasionally sample a new patch instead of always exploiting the best known one.
 * Here: heat-kernel relevance = spatial memory of the graph, MVT = patch-leaving
 * rule, epsilon = stochastic exploration.
 *
 * Pure & deterministic (the random seed is explicit — pass undefined to skip
 * epsilon-greedy entirely).
 */

import { selectByMarginalValue, type ValueItem, type MarginalValueOptions } from '../context/marginal-value-stop.js'

export interface NeuroForageItem extends ValueItem {
  /** Optional node/file id for heat-kernel relevance mapping. */
  id?: string
}

export interface NeuroForageOptions extends MarginalValueOptions {
  /**
   * Heat-kernel relevance map (nodeId → relevance in [0,1] from `heatKernelRelevance()`).
   * When given, each item's gain is multiplied by `(1 + weight * relevance[id])` before MVT.
   */
  relevanceWeights?: Record<string, number>
  /** How much the relevance score boosts the gain (0 = no boost, 1 = up to 2×). Default 0.5. */
  relevanceInfluence?: number
  /**
   * Epsilon-greedy exploration: with this probability (0..1), one dropped item
   * from the tail (after the MVT stop) replaces the lowest-ranked taken item.
   * Default 0 (pure exploit). Pass undefined to skip epsilon-greedy logic entirely.
   */
  epsilon?: number
  /**
   * Explicit random seed for deterministic epsilon-greedy (0..1). Pass undefined for
   * pure MVT without epsilon (the default). When epsilon > 0 but seed is undefined,
   * `Math.random()` is used.
   */
  seed?: number
}

export interface NeuroForageResult {
  /** Indices (into the original input) that were taken. */
  takenIndices: number[]
  /** Id of the item that was swapped in by epsilon-greedy (undefined when none). */
  epsilonSwap?: string
  /** Epsilon dice roll (0..1) — useful for diagnostics. */
  epsilonDice?: number
}

/**
 * Compose heat-kernel relevance → MVT → epsilon-greedy for retrieval decisions.
 *
 * 1. Weight each item's gain by its heat-kernel relevance (if weights are provided).
 * 2. Apply MVT (Charnov) to select items above the habitat-average marginal rate.
 * 3. With ε probability, swap a random dropped item back in (exploration).
 *
 * Returns the final indices into the original `items` array.
 */
export function neuroForage(items: NeuroForageItem[], opts: NeuroForageOptions = {}): NeuroForageResult {
  if (items.length === 0) return { takenIndices: [] }

  const influence = opts.relevanceInfluence ?? 0.5

  // 1. Apply heat-kernel relevance weights to gains.
  const weighted: ValueItem[] = opts.relevanceWeights
    ? items.map((item) => {
        const rel = item.id ? (opts.relevanceWeights![item.id] ?? 0) : 0
        return {
          gain: item.gain * (1 + influence * rel),
          tokens: item.tokens,
        }
      })
    : items.map(({ gain, tokens }) => ({ gain, tokens }))

  // 2. MVT cutoff (always takes at least minItems).
  const mvt = selectByMarginalValue(weighted, { minItems: opts.minItems })

  // 3. Epsilon-greedy: with probability ε, swap a dropped item back.
  const epsilon = opts.epsilon ?? 0
  if (epsilon <= 0 || mvt.takenIndices.length >= items.length) {
    return { takenIndices: mvt.takenIndices }
  }

  const dice = opts.seed ?? Math.random()
  if (dice < epsilon) {
    const dropped = items.map((_, i) => i).filter((i) => !mvt.takenIndices.includes(i))

    if (dropped.length > 0) {
      const swapIn =
        dropped[Math.floor((opts.seed !== undefined ? dice * dropped.length : Math.random()) % dropped.length)]
      const result = [...mvt.takenIndices.slice(0, -1), swapIn]
      return {
        takenIndices: result,
        epsilonSwap: items[swapIn]?.id,
        epsilonDice: dice,
      }
    }
  }

  return { takenIndices: mvt.takenIndices, epsilonDice: dice }
}
