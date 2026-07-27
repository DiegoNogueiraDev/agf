import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CacheKeyComposer } from '../core/cache/cache-key-composer.js'
import { CacheRouter } from '../core/cache/cache-router.js'
import { UnifiedStatsAggregator } from '../core/cache/unified-stats.js'
import { CacheOrchestrator } from '../core/cache/cache-orchestrator.js'
import { fnv1a32, fnv1a64, type CacheRegistration } from '../core/cache/cache-types.js'

describe('CacheKeyComposer', () => {
  const composer = new CacheKeyComposer()

  it('produz key FNV-1a 64-bit de 16 hex chars', () => {
    const key = composer.compose('stats', '', 1)
    expect(key).toMatch(/^[0-9a-f]{16}$/)
  })

  it('produz key determinística para mesmos inputs', () => {
    const k1 = composer.compose('stats', '', 1)
    const k2 = composer.compose('stats', '', 1)
    expect(k1).toBe(k2)
  })

  it('produz key diferente quando cmd muda', () => {
    expect(composer.compose('stats', '', 1)).not.toBe(composer.compose('metrics', '', 1))
  })

  it('produz key 32-bit via método explícito', () => {
    const key = composer.compose32('stats', '', 1)
    expect(key).toMatch(/^[0-9a-f]{8}$/)
  })

  it('produz mesma key 32-bit que implementação legada', () => {
    const legacy = fnv1a32('stats|""|1')
    const our = composer.compose32('stats', '', 1)
    expect(our).toBe(legacy)
  })

  it('produz key 64-bit diferente de 32-bit para mesmo input', () => {
    const k32 = composer.compose32('stats', '', 1)
    const k64 = composer.compose('stats', '', 1)
    expect(k64).not.toBe(k32)
    expect(k64.length).toBe(16)
    expect(k32.length).toBe(8)
  })
})

describe('CacheRouter', () => {
  const router = new CacheRouter()

  it('classifica graph_read tools corretamente', () => {
    expect(router.classify('stats')).toBe('graph_read')
    expect(router.classify('list')).toBe('graph_read')
    expect(router.classify('show')).toBe('graph_read')
    expect(router.classify('metrics')).toBe('graph_read')
  })

  it('classifica graph_mutate tools corretamente', () => {
    expect(router.classify('addNode')).toBe('graph_mutate')
    expect(router.classify('deleteNode')).toBe('graph_mutate')
    expect(router.classify('updateNode')).toBe('graph_mutate')
    expect(router.classify('addEdge')).toBe('graph_mutate')
  })

  it('classifica knowledge tools corretamente', () => {
    expect(router.classify('search')).toBe('knowledge')
    expect(router.classify('context')).toBe('knowledge')
    expect(router.classify('rag')).toBe('knowledge')
  })

  it('classifica code_intel tools corretamente', () => {
    expect(router.classify('code_intelligence')).toBe('code_intel')
    expect(router.classify('definition')).toBe('code_intel')
    expect(router.classify('references')).toBe('code_intel')
  })

  it('classifica session tools corretamente', () => {
    expect(router.classify('findNext')).toBe('session')
    expect(router.classify('getPhase')).toBe('session')
    expect(router.classify('getModel')).toBe('session')
  })

  it('fallback para unknown como graph_read', () => {
    expect(router.classify('some_unknown_tool')).toBe('graph_read')
  })

  it('retorna TTL configurável por categoria', () => {
    const ttl = router.getTTL('graph_read')
    expect(typeof ttl).toBe('number')
    expect(ttl).toBeGreaterThan(0)
  })
})

describe('UnifiedStatsAggregator', () => {
  let aggregator: UnifiedStatsAggregator

  beforeEach(() => {
    aggregator = new UnifiedStatsAggregator()
  })

  it('retorna stats vazias quando nenhum cache registrado', () => {
    const stats = aggregator.snapshot()
    expect(stats.aggregator).toHaveLength(0)
    expect(stats.totalHits).toBe(0)
    expect(stats.totalMisses).toBe(0)
    expect(stats.globalHitRate).toBe(0)
  })

  it('agrega stats de múltiplos caches', () => {
    const cacheA: CacheRegistration = {
      name: 'session',
      hits: () => 10,
      misses: () => 5,
      size: () => 50,
      tokensSaved: () => 2000,
      invalidateAll: () => {},
    }
    const cacheB: CacheRegistration = {
      name: 'tool',
      hits: () => 20,
      misses: () => 10,
      size: () => 100,
      tokensSaved: () => 5000,
      invalidateAll: () => {},
    }
    aggregator.register(cacheA)
    aggregator.register(cacheB)
    const stats = aggregator.snapshot()
    expect(stats.aggregator).toHaveLength(2)
    expect(stats.totalHits).toBe(30)
    expect(stats.totalMisses).toBe(15)
    expect(stats.totalTokensSaved).toBe(7000)
    expect(stats.globalHitRate).toBeCloseTo(66.67, 1)
  })

  it('invalida todos os caches registrados', () => {
    const invalidated: string[] = []
    const cache: CacheRegistration = {
      name: 'tool',
      hits: () => 0,
      misses: () => 0,
      size: () => 0,
      tokensSaved: () => 0,
      invalidateAll: () => {
        invalidated.push('tool')
      },
    }
    aggregator.register(cache)
    aggregator.invalidateAll('test')
    expect(invalidated).toContain('tool')
  })

  it('calcula costSavedUsd corretamente', () => {
    const cache: CacheRegistration = {
      name: 'tool',
      hits: () => 100,
      misses: () => 0,
      size: () => 1,
      tokensSaved: () => 50000,
      invalidateAll: () => {},
    }
    aggregator.register(cache)
    const stats = aggregator.snapshot()
    expect(stats.totalCostSavedUsd).toBe(50000 * 0.000001)
  })

  it('lida com divisão por zero quando não há requests', () => {
    const cache: CacheRegistration = {
      name: 'empty',
      hits: () => 0,
      misses: () => 0,
      size: () => 0,
      tokensSaved: () => 0,
      invalidateAll: () => {},
    }
    aggregator.register(cache)
    const stats = aggregator.snapshot()
    expect(stats.globalHitRate).toBe(0)
  })
})

describe('CacheOrchestrator', () => {
  let orchestrator: CacheOrchestrator

  beforeEach(() => {
    orchestrator = new CacheOrchestrator()
  })

  it('gera cache key via keyComposer', () => {
    const key = orchestrator.composeKey('stats', '')
    expect(key).toMatch(/^[0-9a-f]{16}$/)
  })

  it('classifica tool via router', () => {
    expect(orchestrator.classify('stats')).toBe('graph_read')
  })

  it('registra e retorna stats de cache', () => {
    const cache: CacheRegistration = {
      name: 'test',
      hits: () => 5,
      misses: () => 2,
      size: () => 10,
      tokensSaved: () => 1000,
      invalidateAll: () => {},
    }
    orchestrator.register(cache)
    const stats = orchestrator.getStats()
    expect(stats.totalHits).toBe(5)
    expect(stats.totalTokensSaved).toBe(1000)
  })

  it('invalida todos os caches via orchestrator', () => {
    const invalidated: string[] = []
    const cache: CacheRegistration = {
      name: 'test',
      hits: () => 0,
      misses: () => 0,
      size: () => 0,
      tokensSaved: () => 0,
      invalidateAll: () => {
        invalidated.push('test')
      },
    }
    orchestrator.register(cache)
    orchestrator.invalidateAll('test')
    expect(invalidated).toContain('test')
  })

  it('composeKey produz key 32-bit compatível com implementações legadas', () => {
    const key64 = orchestrator.composeKey('stats', '')
    const key32 = orchestrator.composeKey32('stats', '')
    expect(key64).toMatch(/^[0-9a-f]{16}$/)
    expect(key32).toMatch(/^[0-9a-f]{8}$/)
    expect(key64).not.toBe(key32)
  })
})
