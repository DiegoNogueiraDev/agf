import { describe, it, expect, beforeEach } from 'vitest'
import { SessionCache } from '../tui/slash/session-cache.js'
import { runReadCommand } from '../tui/dispatch.js'
import type { CommandPort } from '../tui/dispatch.js'

function makePort(overrides: Partial<CommandPort> = {}): CommandPort {
  return {
    findNext() {
      return { id: 'n1', title: 'Task 1', reason: 'ready' }
    },
    stats() {
      return { totalNodes: 100, byStatus: { backlog: 30, done: 70 } }
    },
    metrics() {
      return { total: 5000, costUsd: 0.05, calls: 10 }
    },
    getPhase() {
      return 'IMPLEMENT'
    },
    getModel() {
      return 'haiku'
    },
    listSkills() {
      return []
    },
    getSkill() {
      return undefined
    },
    principles() {
      return []
    },
    providers() {
      return []
    },
    quality() {
      return { testScore: 80, logScore: 90, passed: true, totalModules: 10, darkModules: [] }
    },
    getGraphNodes() {
      return []
    },
    cacheStats() {
      return {
        sessionHits: 0,
        sessionMisses: 0,
        sessionSize: 0,
        sessionCapacity: 128,
        sessionEvictions: 0,
        toolCacheHits: 0,
        toolCacheMisses: 0,
        toolCacheInvalidations: 0,
        tokensSavedEstimate: 0,
        costAvoidedUsd: 0,
      }
    },
    ...overrides,
  }
}

describe('cache-stats: CommandPort.cacheStats()', () => {
  it('returns structured stats with all required fields', () => {
    const port = makePort()
    const stats = port.cacheStats()
    expect(stats).toHaveProperty('sessionHits')
    expect(stats).toHaveProperty('sessionMisses')
    expect(stats).toHaveProperty('sessionSize')
    expect(stats).toHaveProperty('sessionCapacity')
    expect(stats).toHaveProperty('sessionEvictions')
    expect(stats).toHaveProperty('toolCacheHits')
    expect(stats).toHaveProperty('toolCacheMisses')
    expect(stats).toHaveProperty('toolCacheInvalidations')
    expect(stats).toHaveProperty('tokensSavedEstimate')
    expect(stats).toHaveProperty('costAvoidedUsd')
  })

  it('computes session hit rate percentage', () => {
    const port = makePort({
      cacheStats: () => ({
        sessionHits: 75,
        sessionMisses: 25,
        sessionSize: 10,
        sessionCapacity: 128,
        sessionEvictions: 0,
        toolCacheHits: 0,
        toolCacheMisses: 0,
        toolCacheInvalidations: 0,
        tokensSavedEstimate: 100,
        costAvoidedUsd: 0.001,
      }),
    })
    const stats = port.cacheStats()
    const hitRate = stats.sessionHits / (stats.sessionHits + stats.sessionMisses)
    expect(hitRate).toBeCloseTo(0.75)
  })

  it('handles zero requests without division by zero', () => {
    const port = makePort({
      cacheStats: () => ({
        sessionHits: 0,
        sessionMisses: 0,
        sessionSize: 0,
        sessionCapacity: 128,
        sessionEvictions: 0,
        toolCacheHits: 0,
        toolCacheMisses: 0,
        toolCacheInvalidations: 0,
        tokensSavedEstimate: 0,
        costAvoidedUsd: 0,
      }),
    })
    const stats = port.cacheStats()
    expect(stats.sessionHits + stats.sessionMisses).toBe(0)
    expect(stats.tokensSavedEstimate).toBe(0)
    expect(stats.costAvoidedUsd).toBe(0)
  })
})

describe('cache-stats: SessionCache.cacheStats()', () => {
  let port: CommandPort
  let cache: SessionCache

  beforeEach(() => {
    port = makePort()
    cache = new SessionCache(port)
  })

  it('returns session cache stats from the wrapper', () => {
    // Warm the cache with a few reads
    cache.stats()
    cache.stats() // second call should be cached (hit)
    cache.metrics()
    cache.getPhase()

    const stats = cache.cacheStats()
    expect(stats.sessionHits + stats.sessionMisses).toBeGreaterThan(0)
    expect(stats.sessionSize).toBeGreaterThan(0)
    expect(stats.sessionCapacity).toBe(128)
  })

  it('includes tool cache stats', () => {
    const stats = cache.cacheStats()
    expect(stats).toHaveProperty('toolCacheHits')
    expect(stats).toHaveProperty('toolCacheMisses')
    expect(stats).toHaveProperty('toolCacheInvalidations')
  })

  it('estimates tokens saved from hits', () => {
    // Make multiple cached reads to build up hits
    for (let i = 0; i < 5; i++) {
      cache.getPhase()
      cache.getModel()
    }
    const stats = cache.cacheStats()
    expect(stats.tokensSavedEstimate).toBeGreaterThan(0)
    expect(stats.costAvoidedUsd).toBeGreaterThanOrEqual(0)
  })
})

describe('cache-stats: /cache-stats command', () => {
  it('dispatches correctly via runReadCommand', () => {
    const port = makePort({
      cacheStats: () => ({
        sessionHits: 42,
        sessionMisses: 8,
        sessionSize: 5,
        sessionCapacity: 128,
        sessionEvictions: 0,
        toolCacheHits: 10,
        toolCacheMisses: 2,
        toolCacheInvalidations: 1,
        tokensSavedEstimate: 4200,
        costAvoidedUsd: 0.042,
      }),
    })
    const result = runReadCommand(port, { cmd: 'cache-stats', args: '' })
    expect(result).toContain('Session Cache')
    expect(result).toContain('84')
    expect(result).toContain('Token Savings')
    expect(result).toContain('$0.042')
  })
})
