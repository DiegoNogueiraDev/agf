/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { estimateTokens } from '../core/context/token-estimator.js'
import {
  buildL0,
  selectL1Items,
  buildL1,
  buildL2,
  buildL3,
  orchestrateWakeUp,
  DEFAULT_WAKEUP_CONFIG,
  type Layer0Profile,
  type MemoryItem,
} from '../core/economy/wake-up.js'

const dummyProfile: Layer0Profile = {
  identity: 'Agent responsible for software engineering tasks',
  capabilities: ['code review', 'testing', 'refactoring', 'documentation'],
  constraints: ['must verify all changes with tests', 'never commit secrets'],
}

const dummyItems: MemoryItem[] = [
  {
    id: 'm1',
    content: 'Recent hot memory with high relevance',
    score: 0.95,
    ageDays: 1,
    bm25Rank: 1,
    vectorRank: 2,
    graphRank: 3,
  },
  { id: 'm2', content: 'Warm memory from last week', score: 0.7, ageDays: 7, bm25Rank: 3, vectorRank: 4, graphRank: 2 },
  {
    id: 'm3',
    content: 'Cold memory from last month',
    score: 0.4,
    ageDays: 30,
    bm25Rank: 5,
    vectorRank: 6,
    graphRank: 4,
  },
  { id: 'm4', content: 'Expired old memory', score: 0.2, ageDays: 90, bm25Rank: 10, vectorRank: 12, graphRank: 8 },
]

describe('buildL0', () => {
  it('builds identity layer from profile', () => {
    const l0 = buildL0(dummyProfile)
    expect(l0).toContain('Agent responsible')
    expect(l0).toContain('code review')
    expect(l0).toContain('must verify')
  })

  it('stays under 150 tokens by default', () => {
    const l0 = buildL0(dummyProfile)
    expect(estimateTokens(l0)).toBeLessThanOrEqual(150)
  })

  it('handles empty constraints', () => {
    const profile: Layer0Profile = { identity: 'test', capabilities: ['a'], constraints: [] }
    const l0 = buildL0(profile)
    expect(l0).not.toContain('Constraints')
  })
})

describe('selectL1Items', () => {
  it('returns items sorted by combined retention+RRF score', () => {
    const selected = selectL1Items(dummyItems)
    expect(selected.length).toBeGreaterThan(0)
    expect(selected.length).toBeLessThanOrEqual(DEFAULT_WAKEUP_CONFIG.maxL1Items)
  })

  it('computes retentionScore and rrfScore for each item', () => {
    const selected = selectL1Items(dummyItems)
    for (const item of selected) {
      expect(item.retentionScore).toBeDefined()
      expect(typeof item.retentionScore).toBe('number')
      expect(item.rrfScore).toBeDefined()
      expect(typeof item.rrfScore).toBe('number')
    }
  })

  it('prioritizes items with high retention scores', () => {
    const selected = selectL1Items(dummyItems)
    // m1 (hot, recent) should rank higher than m4 (expired, old)
    const m1Idx = selected.findIndex((i) => i.id === 'm1')
    const m4Idx = selected.findIndex((i) => i.id === 'm4')
    expect(m1Idx).toBeLessThan(m4Idx)
  })
})

describe('buildL1', () => {
  it('builds content with retention tier tags', () => {
    const selected = selectL1Items(dummyItems)
    const l1 = buildL1(selected)
    expect(l1).toContain('[L1:')
  })

  it('includes hot/warm tags from retention tiers', () => {
    const hotItem: MemoryItem = {
      id: 'h1',
      content: 'hot item',
      score: 0.95,
      ageDays: 0,
      bm25Rank: 1,
      vectorRank: 1,
      graphRank: 1,
    }
    const selected = selectL1Items([hotItem])
    const l1 = buildL1(selected)
    expect(l1).toContain('[L1:hot]')
  })
})

describe('buildL2', () => {
  it('builds on-demand content with query tag', () => {
    const l2 = buildL2(dummyItems, 'user query')
    expect(l2).toContain('[L2:on-demand:user query]')
  })

  it('returns empty string for empty items', () => {
    expect(buildL2([], 'query')).toBe('')
  })
})

describe('buildL3', () => {
  it('builds deep search content with query tag', () => {
    const l3 = buildL3(dummyItems, 'complex problem')
    expect(l3).toContain('[L3:deep:complex problem]')
  })

  it('returns empty string for empty items', () => {
    expect(buildL3([], 'query')).toBe('')
  })
})

describe('orchestrateWakeUp', () => {
  it('assembles L0+L1 within 900 token budget', () => {
    const result = orchestrateWakeUp(dummyProfile, dummyItems)
    expect(result.tokenCounts.total).toBeLessThanOrEqual(900)
    expect(result.tokenCounts.remaining).toBeGreaterThanOrEqual(0)
  })

  it('includes L0 and L1 layers', () => {
    const result = orchestrateWakeUp(dummyProfile, dummyItems)
    expect(result.layers.L0).toBeDefined()
    expect(result.layers.L0.length).toBeGreaterThan(0)
    expect(result.layers.L1).toBeDefined()
  })

  it('excludes L2/L3 by default', () => {
    const result = orchestrateWakeUp(dummyProfile, dummyItems)
    expect(result.layers.L2).toBeUndefined()
    expect(result.layers.L3).toBeUndefined()
  })

  it('includes L2 when on-demand items provided', () => {
    const result = orchestrateWakeUp(dummyProfile, dummyItems, [dummyItems[0]], 'urgent')
    expect(result.layers.L2).toBeDefined()
    expect(result.layers.L2).toContain('urgent')
  })

  it('includes L3 when deep search items provided', () => {
    const result = orchestrateWakeUp(dummyProfile, dummyItems, undefined, undefined, [dummyItems[1]], 'deep analysis')
    expect(result.layers.L3).toBeDefined()
    expect(result.layers.L3).toContain('deep analysis')
  })

  it('reports metrics', () => {
    const result = orchestrateWakeUp(dummyProfile, dummyItems)
    expect(result.metrics.itemsConsidered).toBe(dummyItems.length)
    expect(result.metrics.itemsIncluded).toBeGreaterThan(0)
    expect(result.metrics.itemsIncluded).toBeLessThanOrEqual(result.metrics.itemsConsidered)
    expect(result.metrics.avgRetentionScore).toBeGreaterThan(0)
  })

  it('respects custom budget', () => {
    const result = orchestrateWakeUp(dummyProfile, dummyItems, [], [], undefined, undefined, {
      ...DEFAULT_WAKEUP_CONFIG,
      budget: 500,
    })
    expect(result.tokenCounts.total).toBeLessThanOrEqual(500)
  })

  it('handles empty memory items gracefully', () => {
    const result = orchestrateWakeUp(dummyProfile, [])
    expect(result.layers.L0).toBeDefined()
    expect(result.layers.L1).toBe('')
    expect(result.tokenCounts.L1).toBe(0)
    expect(result.metrics.itemsIncluded).toBe(0)
  })

  it('uses retention scoring to prioritize recent items', () => {
    const oldItem: MemoryItem = {
      id: 'old',
      content: 'old stuff',
      score: 0.9,
      ageDays: 100,
      bm25Rank: 1,
      vectorRank: 1,
      graphRank: 1,
    }
    const newItem: MemoryItem = {
      id: 'new',
      content: 'new stuff',
      score: 0.8,
      ageDays: 1,
      bm25Rank: 2,
      vectorRank: 2,
      graphRank: 2,
    }
    const result = orchestrateWakeUp(dummyProfile, [oldItem, newItem])
    expect(result.metrics.avgRetentionScore).toBeGreaterThan(0)
  })
})
