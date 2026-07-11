import { describe, it, expect } from 'vitest'
import { GraphNavigationHandler } from '../tui/slash/graph-navigation.js'
import { SessionCache } from '../tui/slash/session-cache.js'
import { composeCacheKey } from '../tui/slash/cache-key-composer.js'

describe('launch-smoke: handler registration', () => {
  it('GraphNavigationHandler is instantiable', () => {
    const handler = new GraphNavigationHandler()
    expect(handler).toBeDefined()
    expect(typeof handler.execute).toBe('function')
  })

  it('SessionCache wraps a port without error', () => {
    const port = {
      findNext: () => null,
      stats: () => ({ totalNodes: 0, byStatus: {} }),
      metrics: () => ({ total: 0, costUsd: 0, calls: 0 }),
      getPhase: () => 'IMPLEMENT',
      getModel: () => 'haiku',
      listSkills: () => [],
      getSkill: () => undefined,
      principles: () => [],
      providers: () => [],
      quality: () => ({ testScore: 0, logScore: 0, passed: false, totalModules: 0, darkModules: [] }),
      getGraphNodes: () => [],
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
    }
    const cache = new SessionCache(port)
    expect(cache).toBeDefined()
    expect(typeof cache.cacheStats).toBe('function')
    expect(typeof cache.getStats).toBe('function')
    expect(typeof cache.invalidate).toBe('function')
  })

  it('composeCacheKey is deterministic (same inputs = same output)', () => {
    const fp = { totalNodes: 100, byStatus: { backlog: 50 }, lastMutationTs: 0 }
    const key1 = composeCacheKey('stats', '', fp, 1)
    const key2 = composeCacheKey('stats', '', fp, 1)
    expect(key1).toBe(key2)
    expect(key1).toMatch(/^[0-9a-f]{8}$/)
  })

  it('all core TUI components instantiate without import errors', () => {
    const handler = new GraphNavigationHandler()
    const port = {
      findNext: () => null,
      stats: () => ({ totalNodes: 0, byStatus: {} }),
      metrics: () => ({ total: 0, costUsd: 0, calls: 0 }),
      getPhase: () => 'IMPLEMENT',
      getModel: () => 'haiku',
      listSkills: () => [],
      getSkill: () => undefined,
      principles: () => [],
      providers: () => [],
      quality: () => ({ testScore: 0, logScore: 0, passed: false, totalModules: 0, darkModules: [] }),
      getGraphNodes: () => [],
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
    }
    const cache = new SessionCache(port)
    expect(handler).toBeDefined()
    expect(cache).toBeDefined()
    const key = composeCacheKey('test', '', { totalNodes: 1, byStatus: {}, lastMutationTs: 0 }, 1)
    expect(key).toHaveLength(8)
  })
})
