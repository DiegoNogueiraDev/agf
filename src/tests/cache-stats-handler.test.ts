import { describe, it, expect } from 'vitest'
import { formatCacheStats } from '../tui/slash/cache-stats-handler.js'
import type { CacheStats } from '../tui/slash/session-cache.js'

describe('formatCacheStats', () => {
  it('formats hit rate correctly', () => {
    const stats: CacheStats = { hits: 15, misses: 5, size: 10, capacity: 128, evictions: 2 }
    const result = formatCacheStats(stats)
    expect(result).toContain('Hit rate:  75.0%')
    expect(result).toContain('(15 hits, 5 misses)')
  })

  it('includes evictions line when evictions > 0', () => {
    const stats: CacheStats = { hits: 10, misses: 0, size: 10, capacity: 128, evictions: 3 }
    const result = formatCacheStats(stats)
    expect(result).toContain('Evictions: 3')
  })

  it('omits evictions line when evictions is 0', () => {
    const stats: CacheStats = { hits: 10, misses: 0, size: 10, capacity: 128, evictions: 0 }
    const result = formatCacheStats(stats)
    expect(result).not.toContain('Evictions')
  })

  it('shows 0.0% hit rate when total is 0', () => {
    const stats: CacheStats = { hits: 0, misses: 0, size: 0, capacity: 128, evictions: 0 }
    const result = formatCacheStats(stats)
    expect(result).toContain('Hit rate:  0.0%')
    expect(result).toContain('(0 hits, 0 misses)')
  })

  it('formats large numbers with locale separator', () => {
    const stats: CacheStats = { hits: 2000, misses: 500, size: 50, capacity: 128, evictions: 0 }
    const result = formatCacheStats(stats)
    expect(result).toContain('1,000,000 estimated saved')
  })

  it('includes header and cost line', () => {
    const stats: CacheStats = { hits: 10, misses: 0, size: 5, capacity: 100, evictions: 1 }
    const result = formatCacheStats(stats)
    expect(result).toContain('/cache-stats')
    expect(result).toContain('avoided')
  })
})
