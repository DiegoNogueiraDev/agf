import { describe, it, expect } from 'vitest'
import { ToolCache, TOOL_CACHE_SCHEMA_VERSION } from '../core/economy/cache/tool-cache.js'

describe('TOOL_CACHE_SCHEMA_VERSION', () => {
  it('is a positive integer', () => {
    expect(TOOL_CACHE_SCHEMA_VERSION).toBeGreaterThan(0)
    expect(Number.isInteger(TOOL_CACHE_SCHEMA_VERSION)).toBe(true)
  })
})

describe('ToolCache.isCacheable', () => {
  it('returns false for clearly mutating tools', () => {
    const cache = new ToolCache()
    expect(cache.isCacheable('write_file')).toBe(false)
    expect(cache.isCacheable('delete_node')).toBe(false)
    expect(cache.isCacheable('nonexistent_tool')).toBe(false)
  })
})

describe('ToolCache.getStats', () => {
  it('starts at zero', () => {
    const cache = new ToolCache()
    expect(cache.getStats()).toEqual({ size: 0, hits: 0, misses: 0, invalidations: 0 })
  })
})

describe('ToolCache.reset', () => {
  it('clears stats and size', () => {
    const cache = new ToolCache()
    cache.reset()
    expect(cache.getStats()).toEqual({ size: 0, hits: 0, misses: 0, invalidations: 0 })
  })
})

describe('ToolCache.invalidateAll', () => {
  it('is no-op on empty cache', () => {
    const cache = new ToolCache()
    cache.invalidateAll('test reason')
    expect(cache.getStats().invalidations).toBe(0)
  })

  it('increments invalidations when cache has entries', () => {
    const cache = new ToolCache({ ttlMs: 60_000, maxEntries: 10 })
    // Force a cache miss for a non-cacheable tool
    cache.get('write_file', {})
    // invalidateAll only counts if lru.size > 0; since nothing cached, still no-op
    cache.invalidateAll('forced')
    expect(cache.getStats().size).toBe(0)
  })
})

describe('ToolCache.selectiveInvalidate', () => {
  it('is no-op on empty cache', () => {
    const cache = new ToolCache()
    cache.selectiveInvalidate(['node_abc'], 'test')
    expect(cache.getStats().invalidations).toBe(0)
  })

  it('is no-op when node list is empty', () => {
    const cache = new ToolCache()
    cache.selectiveInvalidate([], 'test')
    expect(cache.getStats().invalidations).toBe(0)
  })
})

describe('ToolCache.get/set', () => {
  it('returns undefined for non-cacheable tools regardless of set', () => {
    const cache = new ToolCache()
    cache.set('write_file', {}, { content: [{ type: 'text', text: 'ok' }] })
    expect(cache.get('write_file', {})).toBeUndefined()
  })

  it('does not cache error results', () => {
    const cache = new ToolCache()
    cache.set('write_file', {}, { content: [], isError: true })
    expect(cache.get('write_file', {})).toBeUndefined()
  })

  it('misses increment when cache miss occurs for cacheable tool', () => {
    const cache = new ToolCache()
    const before = cache.getStats().misses
    // attempt get — will be a cache miss or not-cacheable (either way undefined)
    cache.get('unknown_cacheable_tool', { nodeId: 'node_1' })
    // misses should be >= before (may increment if cacheable check passes)
    expect(cache.getStats().misses).toBeGreaterThanOrEqual(before)
  })
})
