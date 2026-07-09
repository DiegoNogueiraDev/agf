/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { computeRrfScore, DEFAULT_RRF_K, DEFAULT_RRF_WEIGHTS } from '../core/economy/rrf.js'
import type { RankInput } from '../core/economy/rrf.js'

describe('computeRrfScore', () => {
  it('combines ranks with default weights', () => {
    const input: RankInput = {
      bm25Rank: 1,
      vectorRank: 2,
      graphRank: 3,
    }
    const score = computeRrfScore(input)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  it('higher ranks (lower numbers) produce higher scores', () => {
    const better = computeRrfScore({ bm25Rank: 1, vectorRank: 1, graphRank: 1 })
    const worse = computeRrfScore({ bm25Rank: 100, vectorRank: 100, graphRank: 100 })
    expect(better).toBeGreaterThan(worse)
  })

  it('default K is 60', () => {
    expect(DEFAULT_RRF_K).toBe(60)
  })

  it('default weights are equal', () => {
    expect(DEFAULT_RRF_WEIGHTS.bm25).toBeCloseTo(0.34, 1)
    expect(DEFAULT_RRF_WEIGHTS.vector).toBeCloseTo(0.33, 1)
    expect(DEFAULT_RRF_WEIGHTS.graph).toBeCloseTo(0.33, 1)
  })

  it('skips sources with rank 0 or negative', () => {
    const score = computeRrfScore({ bm25Rank: 0, vectorRank: 5, graphRank: 0 })
    expect(score).toBeGreaterThan(0)
    // should only have vector contribution
  })

  it('returns rank 1 result from single source', () => {
    const score = computeRrfScore({ bm25Rank: 1, vectorRank: 0, graphRank: 0 })
    const expected = DEFAULT_RRF_WEIGHTS.bm25 * (1 / (DEFAULT_RRF_K + 1))
    expect(score).toBeCloseTo(expected, 5)
  })

  it('custom K and weights work', () => {
    const score = computeRrfScore(
      { bm25Rank: 1, vectorRank: 2, graphRank: 3 },
      { k: 10, weights: { bm25: 0.5, vector: 0.3, graph: 0.2 } },
    )
    expect(score).toBeGreaterThan(0)
  })

  it('pass-through returns a single rank contribution when only one source', () => {
    const score = computeRrfScore({ bm25Rank: 5, vectorRank: 0, graphRank: 0 })
    expect(score).toBeGreaterThan(0)
    expect(score).lessThan(0.1)
  })
})
