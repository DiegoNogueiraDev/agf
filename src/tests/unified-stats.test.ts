import { describe, it, expect, vi } from 'vitest'
import { UnifiedStatsAggregator } from '../core/cache/unified-stats.js'
import type { CacheRegistration } from '../core/cache/cache-types.js'

function makeReg(name: string, hits = 0, misses = 0, tokens = 0): CacheRegistration {
  return {
    name,
    hits: () => hits,
    misses: () => misses,
    tokensSaved: () => tokens,
    size: () => 0,
    invalidateAll: vi.fn(),
  }
}

describe('UnifiedStatsAggregator', () => {
  it('starts with zero registrations', () => {
    const agg = new UnifiedStatsAggregator()
    expect(agg.registeredCount()).toBe(0)
  })

  it('registers and counts caches', () => {
    const agg = new UnifiedStatsAggregator()
    agg.register(makeReg('a'))
    agg.register(makeReg('b'))
    expect(agg.registeredCount()).toBe(2)
  })

  it('unregisters by name', () => {
    const agg = new UnifiedStatsAggregator()
    agg.register(makeReg('x'))
    agg.unregister('x')
    expect(agg.registeredCount()).toBe(0)
  })

  it('snapshot aggregates totals', () => {
    const agg = new UnifiedStatsAggregator()
    agg.register(makeReg('a', 10, 2, 100))
    agg.register(makeReg('b', 5, 5, 50))

    const s = agg.snapshot()
    expect(s.totalHits).toBe(15)
    expect(s.totalMisses).toBe(7)
    expect(s.totalTokensSaved).toBe(150)
    expect(s.globalHitRate).toBeCloseTo((15 / 22) * 100)
  })

  it('snapshot returns 0 globalHitRate when no calls', () => {
    const agg = new UnifiedStatsAggregator()
    agg.register(makeReg('empty'))
    expect(agg.snapshot().globalHitRate).toBe(0)
  })

  it('invalidateAll calls each cache invalidateAll', () => {
    const agg = new UnifiedStatsAggregator()
    const reg = makeReg('c')
    agg.register(reg)
    agg.invalidateAll('test')
    expect(reg.invalidateAll).toHaveBeenCalledOnce()
  })
})
