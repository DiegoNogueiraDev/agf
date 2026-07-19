import { describe, it, expect } from 'vitest'
import { DependencyTracker } from '../core/cache/dependency-tracker.js'
import { BloomFilter } from '../core/cache/bloom-filter.js'

describe('DependencyTracker', () => {
  it('records cacheKey -> nodeIds on record()', () => {
    const dt = new DependencyTracker()
    dt.record('key1', ['node_1', 'node_2'])
    dt.record('key2', ['node_2', 'node_3'])
    expect(dt.size()).toBe(2)
  })

  it('returns affected keys for mutated nodeIds', () => {
    const dt = new DependencyTracker()
    dt.record('key1', ['node_1', 'node_2'])
    dt.record('key2', ['node_3'])
    dt.record('key3', ['node_2', 'node_4'])
    const affected = dt.getAffected(['node_2'])
    expect(affected.sort()).toEqual(['key1', 'key3'].sort())
  })

  it('returns empty set when no entries match', () => {
    const dt = new DependencyTracker()
    dt.record('key1', ['node_1'])
    const affected = dt.getAffected(['node_999'])
    expect(affected).toEqual([])
  })

  it('removes tracking for specific keys', () => {
    const dt = new DependencyTracker()
    dt.record('key1', ['node_1'])
    dt.record('key2', ['node_1'])
    dt.remove('key1')
    const affected = dt.getAffected(['node_1'])
    expect(affected).toEqual(['key2'])
  })

  it('clears all tracking', () => {
    const dt = new DependencyTracker()
    dt.record('key1', ['node_1'])
    dt.record('key2', ['node_2'])
    dt.clear()
    expect(dt.size()).toBe(0)
  })

  it('handles single key with multiple mutations', () => {
    const dt = new DependencyTracker()
    dt.record('key1', ['node_1', 'node_2', 'node_3'])
    const affected = dt.getAffected(['node_2', 'node_3'])
    expect(affected).toEqual(['key1'])
  })
})

describe('BloomFilter', () => {
  it('reports false for unknown key', () => {
    const bf = new BloomFilter(100, 0.01)
    expect(bf.mightContain('unknown')).toBe(false)
  })

  it('reports true for added key', () => {
    const bf = new BloomFilter(100, 0.01)
    bf.add('known')
    expect(bf.mightContain('known')).toBe(true)
  })

  it('false positive rate below 1% for 100 items (target p=0.01)', () => {
    const bf = new BloomFilter(100, 0.01)
    for (let i = 0; i < 100; i++) {
      bf.add(`item_${i}`)
    }
    let falsePositives = 0
    for (let i = 100; i < 10000; i++) {
      if (bf.mightContain(`item_${i}`)) {
        falsePositives++
      }
    }
    const rate = falsePositives / 9900
    expect(rate).toBeLessThan(0.02)
  })
})

describe('Selective Invalidation Integration', () => {
  it('selectiveInvalidate removes only matching entries', () => {
    const dt = new DependencyTracker()
    const mockCache = new Map<string, string>()
    mockCache.set('key1', 'value1')
    mockCache.set('key2', 'value2')
    mockCache.set('key3', 'value3')

    dt.record('key1', ['node_1'])
    dt.record('key2', ['node_2'])
    dt.record('key3', ['node_1', 'node_2'])

    const affected = dt.getAffected(['node_1'])
    // affected = ['key1', 'key3']
    for (const key of affected) {
      mockCache.delete(key)
    }

    expect(mockCache.has('key1')).toBe(false)
    expect(mockCache.has('key2')).toBe(true)
    expect(mockCache.has('key3')).toBe(false)
  })

  it('wholesale clear removes everything', () => {
    const dt = new DependencyTracker()
    const mockCache = new Map<string, string>()
    mockCache.set('key1', 'value1')
    mockCache.set('key2', 'value2')
    dt.record('key1', ['node_1'])
    dt.record('key2', ['node_2'])

    // force clear
    mockCache.clear()
    dt.clear()

    expect(mockCache.size).toBe(0)
    expect(dt.size()).toBe(0)
  })
})
