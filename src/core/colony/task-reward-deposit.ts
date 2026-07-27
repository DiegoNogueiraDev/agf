/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Closes the ACO reinforcement loop for `agf done`: a completed task deposits
 * pheromone on its tags, with strength derived from delegate-mode-aware reward
 * signals (reward-strength). Success with acPass=true still produces a non-zero
 * trail even when tokensSaved=0 (no provider) — proving the colony learns from
 * externally-driven (delegated) work, not just provider-billed runs.
 *
 * Pure + injectable: the deposit sink is supplied by the caller so the graph
 * write stays in the command layer and this stays unit-testable.
 */

import { computeRewardStrength, type RewardSignals } from '../economy/reward-strength.js'

export interface TaskRewardInput {
  /** Tags of the completed task — each becomes a pheromone trail key. */
  tags: readonly string[]
  /** Reward signals (tokensSaved=0 in fully-delegated mode). */
  signals: RewardSignals
}

/** Sink that writes one pheromone trail. Real impl: depositPheromone(db, projectId, key, amount). */
export type TagDepositFn = (key: string, amount: number) => void

/**
 * Deposits the computed reward strength on each tag of the completed task.
 *
 * - Returns the deposit amount applied (0 when no positive signal → no deposit).
 * - ACO convention: only positive reinforcement; a zero/negative outcome leaves
 *   no scent and the trail evaporates naturally.
 * - Deduplicates tags so a repeated tag is reinforced once per completion.
 *
 * @returns the per-tag deposit amount (0 when nothing was deposited).
 */
export function depositTaskReward(input: TaskRewardInput, deposit: TagDepositFn): number {
  const amount = computeRewardStrength(input.signals)
  if (amount <= 0) return 0
  const seen = new Set<string>()
  for (const tag of input.tags) {
    const key = tag.trim()
    if (key.length === 0 || seen.has(key)) continue
    seen.add(key)
    deposit(key, amount)
  }
  return amount
}
