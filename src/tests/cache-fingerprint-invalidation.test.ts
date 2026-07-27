import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CommandPort, CacheStatsResult } from '../tui/dispatch.js'
import type { AlgorithmsPort } from '../tui/algorithms-port.js'

vi.mock('../core/cache/cache-orchestrator.js', () => ({
  cacheOrchestrator: { register: vi.fn() },
}))
vi.mock('../core/economy/cache/tool-cache.js', () => ({
  toolCache: { getStats: vi.fn().mockReturnValue({ hits: 0, misses: 0, invalidations: 0, size: 0 }) },
}))

// Use the REAL cache-key-composer so fingerprint changes produce different keys
vi.unmock('../tui/slash/cache-key-composer.js')

beforeEach(() => {
  vi.clearAllMocks()
})

function makePort(overrides: Partial<CommandPort> = {}): CommandPort {
  const algorithms: AlgorithmsPort = { execute: vi.fn() } as unknown as AlgorithmsPort
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

describe('SessionCache — fingerprint-based cache invalidation', () => {
  it('returns a cache hit on repeated calls when fingerprint is stable', async () => {
    const { SessionCache } = await import('../tui/slash/session-cache.js')
    const port = makePort()
    const cache = new SessionCache(port)
    cache.getPhase()
    cache.getPhase()
    cache.getPhase()
    const stats = cache.getStats()
    expect(stats.hits).toBeGreaterThanOrEqual(2)
  })

  it('busts the cache when totalNodes changes between calls', async () => {
    const { SessionCache } = await import('../tui/slash/session-cache.js')
    let callCount = 0
    const port = makePort({
      stats: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount <= 2) return { totalNodes: 10, byStatus: { done: 5, backlog: 5 } }
        return { totalNodes: 11, byStatus: { done: 6, backlog: 5 } } // mutation happened
      }),
      getPhase: vi.fn().mockReturnValue('IMPLEMENT'),
    })
    const cache = new SessionCache(port)
    cache.getPhase() // first call → miss, fingerprint = {10, …}
    cache.getPhase() // second call → hit (same fingerprint)
    cache.getPhase() // third call → fingerprint re-check detects totalNodes=11 → bust → miss
    expect(port.getPhase).toHaveBeenCalledTimes(2) // 1st call + 1 after bust
  })

  it('busts the cache when byStatus changes (e.g., task moved to done)', async () => {
    const { SessionCache } = await import('../tui/slash/session-cache.js')
    let callCount = 0
    const port = makePort({
      stats: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount <= 2) return { totalNodes: 10, byStatus: { done: 5, backlog: 5 } }
        return { totalNodes: 10, byStatus: { done: 6, backlog: 4 } } // one task done
      }),
      getPhase: vi.fn().mockReturnValue('IMPLEMENT'),
    })
    const cache = new SessionCache(port)
    cache.getPhase() // miss
    cache.getPhase() // hit
    cache.getPhase() // bust → miss
    expect(port.getPhase).toHaveBeenCalledTimes(2)
  })

  it('≥80% cache hits in 5+ calls without graph mutation', async () => {
    const { SessionCache } = await import('../tui/slash/session-cache.js')
    const port = makePort()
    const cache = new SessionCache(port)
    const N = 10
    for (let i = 0; i < N; i++) cache.getPhase()
    const stats = cache.getStats()
    const hitRate = stats.hits / (stats.hits + stats.misses)
    expect(hitRate).toBeGreaterThanOrEqual(0.8)
  })

  it('does not bust cache when fingerprint is unchanged across many calls', async () => {
    const { SessionCache } = await import('../tui/slash/session-cache.js')
    const port = makePort()
    const cache = new SessionCache(port)
    for (let i = 0; i < 6; i++) {
      cache.getPhase()
      cache.getModel()
      cache.listSkills()
    }
    const stats = cache.getStats()
    expect(stats.evictions).toBe(0)
    expect(stats.hits).toBeGreaterThan(stats.misses)
  })
})
