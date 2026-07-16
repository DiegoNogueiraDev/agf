/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * 5.4 Cache hit rate validation — ToolCache, cache-key, provider-aware
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { ToolCache } from '../core/economy/cache/tool-cache.js'
import { buildCacheKey, canonicalJson } from '../core/economy/cache/cache-key.js'

describe('SessionCache: mesma chamada → cache hit', () => {
  let cache: ToolCache

  beforeEach(() => {
    cache = new ToolCache({ ttlMs: 5000, maxEntries: 100 })
  })

  it('get após set retorna cached', () => {
    cache.set('show', { id: 'node_abc' }, { content: [{ type: 'text', text: 'result' }] })
    const r = cache.get('show', { id: 'node_abc' })
    expect(r).toBeDefined()
    expect(r!.content[0].text).toBe('result')
  })

  it('get sem set retorna undefined (miss)', () => {
    const r = cache.get('show', { id: 'node_xyz' })
    expect(r).toBeUndefined()
  })

  it('segunda chamada idêntica faz hit', () => {
    const args = { id: 'node_123' }
    cache.set('show', args, { content: [{ type: 'text', text: 'data' }] })
    const r1 = cache.get('show', args)
    const r2 = cache.get('show', args)
    expect(r1).toBeDefined()
    expect(r2).toBeDefined()
  })

  it('args diferentes produzem keys diferentes (miss na segunda)', () => {
    cache.set('show', { id: 'node_a' }, { content: [{ type: 'text', text: 'a' }] })
    const r = cache.get('show', { id: 'node_b' })
    expect(r).toBeUndefined()
  })

  it('tool não-cacheable retorna undefined', () => {
    cache.set('add_node' as never, { id: 'x' }, { content: [{ type: 'text', text: 'x' }] })
    const r = cache.get('add_node' as never, { id: 'x' })
    expect(r).toBeUndefined()
  })

  it('erro (isError) nunca é cacheado', () => {
    cache.set('show', { id: 'node_err' }, { content: [{ type: 'text', text: 'err' }], isError: true })
    const r = cache.get('show', { id: 'node_err' })
    expect(r).toBeUndefined()
  })
})

describe('cache-key: estável entre builds', () => {
  it('mesmo input → mesmo hash', () => {
    const k1 = buildCacheKey({ toolName: 'show', args: { id: 'node_x' }, schemaVersion: 1 })
    const k2 = buildCacheKey({ toolName: 'show', args: { id: 'node_x' }, schemaVersion: 1 })
    expect(k1).toBe(k2)
  })

  it('input diferente → hash diferente', () => {
    const k1 = buildCacheKey({ toolName: 'show', args: { id: 'a' }, schemaVersion: 1 })
    const k2 = buildCacheKey({ toolName: 'show', args: { id: 'b' }, schemaVersion: 1 })
    expect(k1).not.toBe(k2)
  })

  it('canonicalJson é determinística (keys sorteadas)', () => {
    const j1 = canonicalJson({ b: 2, a: 1 })
    const j2 = canonicalJson({ a: 1, b: 2 })
    expect(j1).toBe(j2)
  })
})

describe('provider-aware: providers diferentes → fingerprints diferentes', () => {
  it('model diferente → key diferente', () => {
    const k1 = buildCacheKey({ toolName: 'search', args: { q: 'test' }, schemaVersion: 1, model: 'haiku' })
    const k2 = buildCacheKey({ toolName: 'search', args: { q: 'test' }, schemaVersion: 1, model: 'sonnet' })
    expect(k1).not.toBe(k2)
  })

  it('model ausente vs presente → key diferente', () => {
    const k1 = buildCacheKey({ toolName: 'search', args: { q: 'test' }, schemaVersion: 1 })
    const k2 = buildCacheKey({ toolName: 'search', args: { q: 'test' }, schemaVersion: 1, model: 'sonnet' })
    expect(k1).not.toBe(k2)
  })
})

describe('schema version bump invalida cache', () => {
  it('schemaVersion diferente → key diferente', () => {
    const k1 = buildCacheKey({ toolName: 'show', args: { id: 'x' }, schemaVersion: 1 })
    const k2 = buildCacheKey({ toolName: 'show', args: { id: 'x' }, schemaVersion: 2 })
    expect(k1).not.toBe(k2)
  })

  it('invalidateAll limpa todas as entradas', () => {
    const cache = new ToolCache({ ttlMs: 5000, maxEntries: 100 })
    cache.set('show', { id: 'n1' }, { content: [{ type: 'text', text: 'v1' }] })
    expect(cache.get('show', { id: 'n1' })).toBeDefined()

    cache.invalidateAll('test-bump')
    expect(cache.get('show', { id: 'n1' })).toBeUndefined()
    expect(cache.getStats().invalidations).toBe(1)
  })
})

describe('ToolCache stats tracking', () => {
  it('hits/misses/invalidations corretos', () => {
    const cache = new ToolCache({ ttlMs: 5000, maxEntries: 100 })
    cache.get('show', { id: 'm1' }) // miss
    cache.set('show', { id: 'm1' }, { content: [{ type: 'text', text: 'data' }] })
    cache.get('show', { id: 'm1' }) // hit
    cache.get('show', { id: 'm2' }) // miss
    cache.invalidateAll('test')
    const s = cache.getStats()
    expect(s.hits).toBe(1)
    expect(s.misses).toBe(2)
    expect(s.invalidations).toBe(1)
  })
})
