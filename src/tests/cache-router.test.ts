import { describe, it, expect } from 'vitest'
import { CacheRouter } from '../core/cache/cache-router.js'

describe('CacheRouter.classify', () => {
  const router = new CacheRouter()

  it('classifies stats as graph_read', () => {
    expect(router.classify('stats')).toBe('graph_read')
  })

  it('classifies addNode as graph_mutate', () => {
    expect(router.classify('addNode')).toBe('graph_mutate')
  })

  it('classifies search as knowledge', () => {
    expect(router.classify('search')).toBe('knowledge')
  })

  it('classifies definition as code_intel', () => {
    expect(router.classify('definition')).toBe('code_intel')
  })

  it('classifies listSkills as session', () => {
    expect(router.classify('listSkills')).toBe('session')
  })

  it('defaults unknown tools to graph_read', () => {
    expect(router.classify('unknownTool')).toBe('graph_read')
  })
})

describe('CacheRouter.isCacheable', () => {
  const router = new CacheRouter()

  it('read tools are cacheable', () => {
    expect(router.isCacheable('stats')).toBe(true)
  })

  it('mutate tools are not cacheable', () => {
    expect(router.isCacheable('addNode')).toBe(false)
  })

  it('knowledge tools are cacheable', () => {
    expect(router.isCacheable('search')).toBe(true)
  })
})

describe('CacheRouter.getTTL', () => {
  const router = new CacheRouter()

  it('returns number for graph_read', () => {
    expect(typeof router.getTTL('graph_read')).toBe('number')
  })

  it('graph_mutate TTL is 0', () => {
    expect(router.getTTL('graph_mutate')).toBe(0)
  })

  it('knowledge TTL is positive', () => {
    expect(router.getTTL('knowledge')).toBeGreaterThan(0)
  })
})

describe('CacheRouter custom config', () => {
  it('accepts partial custom TTLs', () => {
    const router = new CacheRouter({ graph_read: 99_000 })
    expect(router.getTTL('graph_read')).toBe(99_000)
  })

  it('getConfig returns config object', () => {
    const router = new CacheRouter()
    const config = router.getConfig()
    expect(typeof config).toBe('object')
    expect(typeof config.graph_read).toBe('number')
  })
})
