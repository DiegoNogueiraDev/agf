/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Deterministic Ranker — stable, reproducible ordering of search results.
 *
 * Primary sort: score descending (higher is better).
 * Tiebreaker: id ascending (lexicographic) — deterministic across runs.
 *
 * Also provides scoresDriftWithinTolerance for reindex regression detection.
 */

export interface RankableItem {
  readonly id: string
  readonly score: number
}

/**
 * Sort items by score descending, with id ascending as deterministic tiebreaker.
 * Does not mutate the input array.
 */
export function deterministicRank<T extends RankableItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * Check whether scores changed by more than `tolerance` after a reindex.
 *
 * Returns `true` when all items in `before` that appear in `after` have
 * abs(after.score - before.score) <= tolerance.
 * Newly added items (in `after` but not `before`) are not penalized.
 * Items removed from `after` (present in `before`) count as a violation.
 */
export function scoresDriftWithinTolerance(
  before: readonly RankableItem[],
  after: readonly RankableItem[],
  tolerance: number,
): boolean {
  const afterMap = new Map(after.map((item) => [item.id, item.score]))

  for (const prev of before) {
    const nextScore = afterMap.get(prev.id)
    if (nextScore === undefined) {
      return false
    }
    if (Math.abs(nextScore - prev.score) > tolerance) {
      return false
    }
  }

  return true
}
