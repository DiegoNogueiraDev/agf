/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { searchL2, searchL3, type L2SearchOptions, type L3SearchOptions } from '../core/economy/wake-up-l2-l3.js'
import type { MemoryItem } from '../core/economy/wake-up.js'

const sampleItems: MemoryItem[] = [
  {
    id: 'm1',
    content: 'The quick brown fox jumps over the lazy dog',
    score: 0.9,
    ageDays: 1,
    bm25Rank: 1,
    vectorRank: 2,
    graphRank: 1,
  },
  {
    id: 'm2',
    content: 'Cache invalidation is one of the hard problems in CS',
    score: 0.8,
    ageDays: 5,
    bm25Rank: 3,
    vectorRank: 3,
    graphRank: 2,
  },
  {
    id: 'm3',
    content: 'Naming things and cache invalidation are hard problems',
    score: 0.7,
    ageDays: 10,
    bm25Rank: 5,
    vectorRank: 4,
    graphRank: 3,
  },
  {
    id: 'm4',
    content: 'Testing strategy follows the test pyramid model',
    score: 0.85,
    ageDays: 2,
    bm25Rank: 2,
    vectorRank: 1,
    graphRank: 4,
  },
  {
    id: 'm5',
    content: 'Database transactions ensure ACID compliance',
    score: 0.6,
    ageDays: 20,
    bm25Rank: 4,
    vectorRank: 5,
    graphRank: 5,
  },
]

describe('searchL2 (on-demand)', () => {
  it('returns results for a matching query', () => {
    const result = searchL2(sampleItems, 'cache')
    expect(result.items.length).toBeGreaterThan(0)
    expect(result.items.some((i) => i.content.includes('Cache'))).toBe(true)
  })

  it('returns empty for unmatched query', () => {
    const result = searchL2(sampleItems, 'zzzzzxyz')
    expect(result.items).toHaveLength(0)
    expect(result.content).toBe('')
  })

  it('respects maxTokens option', () => {
    const result = searchL2(sampleItems, 'cache', { maxTokens: 50 })
    expect(result.tokenCount).toBeLessThanOrEqual(50)
  })

  it('tags output with L2 markers', () => {
    const result = searchL2(sampleItems, 'cache')
    if (result.content) {
      expect(result.content).toContain('[L2:on-demand:cache]')
    }
  })

  it('returns empty for empty input items', () => {
    const result = searchL2([], 'query')
    expect(result.items).toHaveLength(0)
    expect(result.content).toBe('')
    expect(result.tokenCount).toBe(0)
  })

  it('returns topK results sorted by relevance', () => {
    const result = searchL2(sampleItems, 'cache', { topK: 2 })
    expect(result.items.length).toBeLessThanOrEqual(2)
    // items mentioning "cache invalidation" should rank higher
    const scores = result.items.map((i) => i.score)
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i])
    }
  })
})

describe('searchL3 (deep search fallback)', () => {
  it('returns BM25-scored results for a query', () => {
    const result = searchL3(sampleItems, 'cache invalidation')
    expect(result.items.length).toBeGreaterThan(0)
    // items about cache invalidation should be top
    expect(result.items.some((i) => i.content.includes('cache invalidation'))).toBe(true)
  })

  it('integrates RRF scoring for each result', () => {
    const result = searchL3(sampleItems, 'testing')
    for (const item of result.items) {
      expect(item.rrfScore).toBeDefined()
      expect(typeof item.rrfScore).toBe('number')
      expect(item.rrfScore).toBeGreaterThan(0)
    }
  })

  it('respects maxTokens option', () => {
    const result = searchL3(sampleItems, 'cache', { maxTokens: 80 })
    expect(result.tokenCount).toBeLessThanOrEqual(80)
  })

  it('tags output with L3 markers', () => {
    const result = searchL3(sampleItems, 'database')
    if (result.content) {
      expect(result.content).toContain('[L3:deep]')
    }
  })

  it('returns empty for unmatched query', () => {
    const result = searchL3(sampleItems, 'qqqqqq')
    expect(result.items).toHaveLength(0)
    expect(result.content).toBe('')
    expect(result.tokenCount).toBe(0)
  })

  it('returns empty for empty input', () => {
    const result = searchL3([], 'query')
    expect(result.items).toHaveLength(0)
  })

  it('sorts by RRF score descending', () => {
    const result = searchL3(sampleItems, 'hard problems')
    const scores = result.items.map((i) => i.rrfScore!)
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i])
    }
  })
})
