/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { estimateTokens } from '../core/context/token-estimator.js'
import {
  buildL1Essential,
  type L1EssentialOptions,
  type L1EssentialResult,
  type L1MemoryItem,
} from '../core/economy/wake-up-l1.js'
import type { MemoryItem } from '../core/economy/wake-up.js'

function makeItem(overrides: Partial<MemoryItem> & { id: string }): MemoryItem {
  return {
    content: 'some content',
    score: 0.8,
    ageDays: 1,
    bm25Rank: 1,
    vectorRank: 1,
    graphRank: 1,
    ...overrides,
  }
}

const hotItem: MemoryItem = makeItem({ id: 'h1', content: 'hot recent fact', score: 0.95, ageDays: 0 })
const hotItem2: MemoryItem = makeItem({ id: 'h2', content: 'another hot item', score: 0.9, ageDays: 2 })
const warmItem: MemoryItem = makeItem({ id: 'w1', content: 'warm memory', score: 0.6, ageDays: 10 })
const coldItem: MemoryItem = makeItem({ id: 'c1', content: 'cold fact', score: 0.3, ageDays: 60 })
const expiredItem: MemoryItem = makeItem({ id: 'e1', content: 'expired noise', score: 0.1, ageDays: 200 })

describe('buildL1Essential', () => {
  it('filters to hot memory only (retention ≥ 0.7)', () => {
    const result = buildL1Essential([hotItem, warmItem, coldItem, expiredItem])
    expect(result.items.some((i) => i.id === 'h1')).toBe(true)
    expect(result.items.some((i) => i.id === 'w1')).toBe(false)
    expect(result.items.some((i) => i.id === 'c1')).toBe(false)
    expect(result.items.some((i) => i.id === 'e1')).toBe(false)
  })

  it('stays within 800 token default budget', () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      makeItem({
        id: `m${i}`,
        content: `memory item number ${i} with enough text to simulate realistic token usage `.repeat(3),
        score: 0.85 + Math.random() * 0.15,
        ageDays: Math.floor(Math.random() * 5),
      }),
    )
    const result = buildL1Essential(items)
    expect(result.tokenCount).toBeLessThanOrEqual(800)
  })

  it('respects custom maxTokens option', () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      makeItem({
        id: `m${i}`,
        content: 'token heavy content '.repeat(10),
        score: 0.95,
        ageDays: 0,
      }),
    )
    const result = buildL1Essential(items, { maxTokens: 200 })
    expect(result.tokenCount).toBeLessThanOrEqual(200)
  })

  it('computes RRF scores for each included item', () => {
    const result = buildL1Essential([hotItem, hotItem2])
    expect(result.items.length).toBeGreaterThan(0)
    for (const item of result.items) {
      expect(item.rrfScore).toBeDefined()
      expect(typeof item.rrfScore).toBe('number')
      expect(item.rrfScore).toBeGreaterThan(0)
    }
  })

  it('sorts by RRF score descending', () => {
    const items = [
      makeItem({ id: 'high', content: 'high rrf', score: 0.95, ageDays: 0, bm25Rank: 1, vectorRank: 1, graphRank: 1 }),
      makeItem({
        id: 'low',
        content: 'low rrf',
        score: 0.85,
        ageDays: 1,
        bm25Rank: 100,
        vectorRank: 100,
        graphRank: 100,
      }),
    ]
    const result = buildL1Essential(items)
    const idxHigh = result.items.findIndex((i) => i.id === 'high')
    const idxLow = result.items.findIndex((i) => i.id === 'low')
    expect(idxHigh).toBeLessThan(idxLow)
  })

  it('includes retention score in result items', () => {
    const result = buildL1Essential([hotItem])
    for (const item of result.items) {
      expect(item.retentionScore).toBeDefined()
      expect(typeof item.retentionScore).toBe('number')
    }
  })

  it('outputs L1 tagged content string', () => {
    const result = buildL1Essential([hotItem])
    expect(result.content).toContain('[L1:hot]')
    expect(result.content).toContain('hot recent fact')
  })

  it('handles empty input gracefully', () => {
    const result = buildL1Essential([])
    expect(result.items).toHaveLength(0)
    expect(result.content).toBe('')
    expect(result.tokenCount).toBe(0)
  })

  it('handles no hot items gracefully', () => {
    const result = buildL1Essential([coldItem, expiredItem])
    expect(result.items).toHaveLength(0)
    expect(result.content).toBe('')
    expect(result.tokenCount).toBe(0)
  })

  it('computes average retention and RRF metrics', () => {
    const result = buildL1Essential([hotItem, hotItem2])
    expect(result.avgRetentionScore).toBeGreaterThan(0.8)
    expect(result.avgRetentionScore).toBeLessThanOrEqual(1)
    expect(result.avgRrfScore).toBeGreaterThan(0)
  })

  it('reports total input items considered', () => {
    const result = buildL1Essential([hotItem, warmItem, coldItem])
    expect(result.consideredCount).toBe(3)
  })
})
