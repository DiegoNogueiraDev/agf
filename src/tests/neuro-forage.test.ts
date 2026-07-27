import { describe, it, expect } from 'vitest'
import { neuroForage } from '../core/economy/neuro-forage.js'
import type { NeuroForageItem } from '../core/economy/neuro-forage.js'

function makeItem(id: string, gain: number, tokens: number): NeuroForageItem {
  return { id, gain, tokens }
}

describe('neuroForage', () => {
  it('returns empty takenIndices for empty items array', () => {
    const result = neuroForage([])
    expect(result.takenIndices).toHaveLength(0)
  })

  it('selects items by marginal value with default opts', () => {
    const items = [makeItem('a', 10, 100), makeItem('b', 1, 100), makeItem('c', 5, 100)]
    const result = neuroForage(items)
    expect(result.takenIndices.length).toBeGreaterThan(0)
  })

  it('selects higher-gain items when budget is limited', () => {
    const items = [makeItem('high', 100, 10), makeItem('low', 1, 10)]
    const result = neuroForage(items, { budget: 12 })
    expect(result.takenIndices).toContain(0)
  })

  it('applies relevance weights to boost selection', () => {
    const items = [makeItem('a', 5, 10), makeItem('b', 5, 10)]
    const result = neuroForage(items, {
      relevanceWeights: { a: 1.0, b: 0.0 },
      relevanceInfluence: 1.0,
      budget: 12,
    })
    expect(result.takenIndices).toContain(0)
  })

  it('epsilon=0 never randomly swaps items', () => {
    const items = [makeItem('a', 10, 5), makeItem('b', 1, 5)]
    const result = neuroForage(items, { epsilon: 0, budget: 7 })
    expect(result.takenIndices).toContain(0)
    expect(result.takenIndices).not.toContain(1)
  })
})
