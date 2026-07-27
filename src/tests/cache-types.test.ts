import { describe, it, expect } from 'vitest'
import type { QueryCategory, CacheRegistration, CacheStatsSnapshot, UnifiedStats } from '../core/cache/cache-types.js'

describe('cache-types', () => {
  it('CacheRegistration interface can be implemented', () => {
    let _hits = 0
    let _misses = 0
    const reg: CacheRegistration = {
      name: 'graph-read-cache',
      hits: () => _hits,
      misses: () => _misses,
      size: () => 10,
      tokensSaved: () => 500,
      invalidateAll: () => {
        _hits = 0
        _misses = 0
      },
    }
    _hits = 3
    _misses = 1
    expect(reg.hits()).toBe(3)
    expect(reg.misses()).toBe(1)
    expect(reg.size()).toBe(10)
    expect(reg.tokensSaved()).toBe(500)
    reg.invalidateAll()
    expect(reg.hits()).toBe(0)
  })

  it('CacheStatsSnapshot holds computed stats', () => {
    const snap: CacheStatsSnapshot = {
      name: 'knowledge-cache',
      hits: 80,
      misses: 20,
      size: 100,
      tokensSaved: 4000,
      hitRate: 0.8,
    }
    expect(snap.hitRate).toBe(0.8)
    expect(snap.hits + snap.misses).toBe(100)
  })

  it('UnifiedStats aggregates across caches', () => {
    const stats: UnifiedStats = {
      aggregator: [{ name: 'a', hits: 10, misses: 2, size: 5, tokensSaved: 200, hitRate: 10 / 12 }],
      totalHits: 10,
      totalMisses: 2,
      totalTokensSaved: 200,
      totalCostSavedUsd: 0.01,
      globalHitRate: 10 / 12,
      timestamp: 1_700_000_000,
    }
    expect(stats.aggregator).toHaveLength(1)
    expect(stats.totalHits).toBe(10)
  })

  it('QueryCategory covers all five categories', () => {
    const cats: QueryCategory[] = ['graph_read', 'graph_mutate', 'knowledge', 'code_intel', 'session']
    expect(cats).toHaveLength(5)
  })
})
