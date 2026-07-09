import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CommandPort, CacheStatsResult } from '../tui/dispatch.js'
import type { AlgorithmsPort } from '../tui/algorithms-port.js'
import { SessionCache } from '../tui/slash/session-cache.js'
import { toolCache } from '../core/economy/cache/tool-cache.js'

vi.mock('../core/cache/cache-orchestrator.js', () => ({
  cacheOrchestrator: { register: vi.fn() },
}))
vi.mock('../core/economy/cache/tool-cache.js', () => ({
  toolCache: { getStats: vi.fn().mockReturnValue({ hits: 0, misses: 0, invalidations: 0, size: 0 }) },
}))
vi.mock('../tui/slash/cache-key-composer.js', () => ({
  composeCacheKey: vi.fn((cmd: string, args: string, _fp: unknown, _sv: number) => `${cmd}|${args}`),
  CURRENT_CACHE_SCHEMA: 1,
  composeCacheKey64: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(toolCache.getStats).mockReturnValue({ hits: 0, misses: 0, invalidations: 0, size: 0 })
})

function makePort(overrides: Partial<CommandPort> = {}): CommandPort {
  const algorithms: AlgorithmsPort = {
    execute: vi.fn() as never,
  } as unknown as AlgorithmsPort
  return {
    findNext: vi.fn().mockReturnValue(null),
    stats: vi.fn().mockReturnValue({ totalNodes: 10, byStatus: { done: 5, backlog: 5 } }),
    metrics: vi.fn().mockReturnValue({ total: 100, costUsd: 0.05, calls: 10 }),
    status: vi.fn().mockReturnValue('ok'),
    getPhase: vi.fn().mockReturnValue('IMPLEMENT'),
    getModel: vi.fn().mockReturnValue('gpt-4'),
    listSkills: vi.fn().mockReturnValue([]),
    getSkill: vi.fn().mockReturnValue(undefined),
    principles: vi.fn().mockReturnValue([]),
    providers: vi.fn().mockReturnValue(['openai']),
    providerCurrent: vi.fn().mockReturnValue('openai'),
    providerSet: vi.fn().mockReturnValue('ok'),
    providerSetUrl: vi.fn().mockReturnValue('ok'),
    quality: vi.fn().mockReturnValue({ testScore: 80, logScore: 70, passed: true, totalModules: 10, darkModules: [] }),
    insights: vi.fn().mockReturnValue(''),
    gate: vi.fn().mockReturnValue(''),
    learning: vi.fn().mockReturnValue(''),
    heal: vi.fn().mockReturnValue('healed'),
    getGraphNodes: vi.fn().mockReturnValue([]),
    cacheStats: vi.fn().mockReturnValue({} as CacheStatsResult),
    algorithms,
    ...overrides,
  } as CommandPort
}

describe('SessionCache', () => {
  it('registers with orchestrator on construction', async () => {
    const { cacheOrchestrator: orch } = await import('../core/cache/cache-orchestrator.js')
    const port = makePort()
    const cache = new SessionCache(port, 64)
    expect(orch.register).toHaveBeenCalledTimes(1)
    expect(orch.register).toHaveBeenCalledWith(expect.objectContaining({ name: 'session' }))
  })

  describe('cached methods', () => {
    it('caches stats() result and returns same value on second call', () => {
      const port = makePort()
      const cache = new SessionCache(port)
      const first = cache.stats()
      const second = cache.stats()
      expect(first).toEqual(second)
      // fingerprint (1) + compute (1) on first call; fingerprint cached on second
      expect(port.stats).toHaveBeenCalledTimes(2)
    })

    it('caches getPhase() result', () => {
      const port = makePort()
      const cache = new SessionCache(port)
      cache.getPhase()
      cache.getPhase()
      expect(port.getPhase).toHaveBeenCalledTimes(1)
    })

    it('caches getModel() result', () => {
      const port = makePort()
      const cache = new SessionCache(port)
      cache.getModel()
      cache.getModel()
      expect(port.getModel).toHaveBeenCalledTimes(1)
    })

    it('caches listSkills() result', () => {
      const skills = [{ name: 'graph-analyze', desc: 'Analyze', category: 'lifecycle' }]
      const port = makePort({ listSkills: vi.fn().mockReturnValue(skills) })
      const cache = new SessionCache(port)
      expect(cache.listSkills()).toEqual(skills)
      expect(cache.listSkills()).toEqual(skills)
      expect(port.listSkills).toHaveBeenCalledTimes(1)
    })

    it('caches getSkill() result', () => {
      const skill = { name: 'heal', body: '# Heal' }
      const port = makePort({ getSkill: vi.fn().mockReturnValue(skill) })
      const cache = new SessionCache(port)
      expect(cache.getSkill('heal')).toEqual(skill)
      expect(cache.getSkill('heal')).toEqual(skill)
      expect(port.getSkill).toHaveBeenCalledTimes(1)
    })

    it('caches principles() result', () => {
      const port = makePort()
      const cache = new SessionCache(port)
      cache.principles()
      cache.principles()
      expect(port.principles).toHaveBeenCalledTimes(1)
    })

    it('caches providers() result', () => {
      const port = makePort()
      const cache = new SessionCache(port)
      cache.providers()
      cache.providers()
      expect(port.providers).toHaveBeenCalledTimes(1)
    })

    it('caches quality() result', () => {
      const port = makePort()
      const cache = new SessionCache(port)
      cache.quality()
      cache.quality()
      expect(port.quality).toHaveBeenCalledTimes(1)
    })

    it('caches metrics() result', () => {
      const port = makePort()
      const cache = new SessionCache(port)
      cache.metrics()
      cache.metrics()
      expect(port.metrics).toHaveBeenCalledTimes(1)
    })
  })

  describe('non-cached methods', () => {
    it('does not cache findNext()', () => {
      const port = makePort({ findNext: vi.fn().mockReturnValue({ id: 'n1', title: 'T1', reason: 'test' }) })
      const cache = new SessionCache(port)
      cache.findNext()
      cache.findNext()
      expect(port.findNext).toHaveBeenCalledTimes(2)
    })

    it('does not cache getGraphNodes()', () => {
      const port = makePort()
      const cache = new SessionCache(port)
      cache.getGraphNodes()
      cache.getGraphNodes()
      expect(port.getGraphNodes).toHaveBeenCalledTimes(2)
    })

    it('does not cache status()', () => {
      const port = makePort()
      const cache = new SessionCache(port)
      cache.status()
      cache.status()
      expect(port.status).toHaveBeenCalledTimes(2)
    })

    it('does not cache insights()', () => {
      const port = makePort()
      const cache = new SessionCache(port)
      cache.insights('test')
      cache.insights('test')
      expect(port.insights).toHaveBeenCalledTimes(2)
    })

    it('does not cache gate()', () => {
      const port = makePort()
      const cache = new SessionCache(port)
      cache.gate('IMPLEMENT')
      cache.gate('IMPLEMENT')
      expect(port.gate).toHaveBeenCalledTimes(2)
    })

    it('does not cache learning()', () => {
      const port = makePort()
      const cache = new SessionCache(port)
      cache.learning('test')
      cache.learning('test')
      expect(port.learning).toHaveBeenCalledTimes(2)
    })

    it('does not cache heal()', () => {
      const port = makePort()
      const cache = new SessionCache(port)
      cache.heal('test')
      cache.heal('test')
      expect(port.heal).toHaveBeenCalledTimes(2)
    })

    it('does not cache providerCurrent()', () => {
      const port = makePort()
      const cache = new SessionCache(port)
      cache.providerCurrent()
      cache.providerCurrent()
      expect(port.providerCurrent).toHaveBeenCalledTimes(2)
    })
  })

  describe('invalidate', () => {
    it('clears cache and forces re-read on next call', () => {
      const port = makePort()
      const cache = new SessionCache(port)
      cache.stats()
      cache.stats()
      // fingerprint re-checked on every access: 1 call per cache.stats() invocation
      expect(port.stats).toHaveBeenCalledTimes(2)

      cache.invalidate()
      cache.stats()
      // after invalidate, fingerprint re-fetched on next call: +1 (reuses lastStats for compute)
      expect(port.stats).toHaveBeenCalledTimes(3)
    })
  })

  describe('providerSet', () => {
    it('calls port.providerSet and invalidates cache', () => {
      const port = makePort()
      const cache = new SessionCache(port)
      cache.stats()
      expect(cache.getStats().hits).toBe(0)

      cache.providerSet('anthropic')
      expect(port.providerSet).toHaveBeenCalledWith('anthropic')

      cache.stats()
      // 1 call for initial stats(), providerSet calls invalidate (no stats call), 1 call for second stats()
      expect(port.stats).toHaveBeenCalledTimes(2)
    })
  })

  describe('providerSetUrl', () => {
    it('calls port.providerSetUrl and invalidates cache', () => {
      const port = makePort()
      const cache = new SessionCache(port)
      cache.stats()

      cache.providerSetUrl('http://localhost:8080')
      expect(port.providerSetUrl).toHaveBeenCalledWith('http://localhost:8080')

      cache.stats()
      // 1 call for initial stats(), providerSetUrl calls invalidate (no stats call), 1 call for second stats()
      expect(port.stats).toHaveBeenCalledTimes(2)
    })
  })

  describe('getStats', () => {
    it('returns current cache statistics', () => {
      const port = makePort()
      const cache = new SessionCache(port, 128)
      expect(cache.getStats()).toEqual({ hits: 0, misses: 0, size: 0, capacity: 128, evictions: 0 })
      cache.stats()
      const stats = cache.getStats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(1)
      expect(stats.size).toBe(1)
    })
  })

  describe('cacheStats', () => {
    it('returns aggregated stats from session and tool cache', () => {
      vi.mocked(toolCache.getStats).mockReturnValue({ hits: 5, misses: 3, invalidations: 1, size: 10 })

      const port = makePort()
      const cache = new SessionCache(port, 128)
      cache.stats()
      cache.stats()
      const result = cache.cacheStats()
      expect(result.sessionHits).toBe(1)
      expect(result.sessionMisses).toBe(1)
      expect(result.toolCacheHits).toBe(5)
      expect(result.toolCacheMisses).toBe(3)
      expect(result.toolCacheInvalidations).toBe(1)
      expect(result.tokensSavedEstimate).toBeGreaterThan(0)
      expect(result.costAvoidedUsd).toBeGreaterThan(0)
    })
  })

  describe('eviction', () => {
    it('evicts oldest entry when capacity is exceeded', () => {
      const port = makePort({
        stats: vi.fn().mockReturnValue({ totalNodes: 10, byStatus: { done: 10 } }),
      })
      const cache = new SessionCache(port, 2)
      cache.stats()
      cache.getPhase()
      cache.getModel()
      // fingerprint re-checked once per cached() call: stats(), getPhase(), getModel() → 3 calls
      expect(port.stats).toHaveBeenCalledTimes(3)
      const stats = cache.getStats()
      expect(stats.size).toBe(2)
      expect(stats.evictions).toBe(1)
    })
  })

  describe('algorithms', () => {
    it('passes through to port.algorithms', () => {
      const algorithms: AlgorithmsPort = { execute: vi.fn() } as unknown as AlgorithmsPort
      const port = makePort({ algorithms })
      const cache = new SessionCache(port)
      expect(cache.algorithms).toBe(algorithms)
    })
  })

  describe('default capacity', () => {
    it('uses 128 by default', () => {
      const port = makePort()
      const cache = new SessionCache(port)
      expect(cache.getStats().capacity).toBe(128)
    })
  })

  describe('schema version', () => {
    it('uses CURRENT_CACHE_SCHEMA for key composition', () => {
      const port = makePort()
      const cache = new SessionCache(port)

      cache.stats()
      cache.stats()
      const stats = cache.getStats()
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(1)
    })
  })
})
