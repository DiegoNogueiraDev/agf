/*!
 * Task node_3199c52beb52 — LspCache tests.
 *
 * AC1: set(ns, key, …, mtime) → get with same mtime returns value; different mtime → null.
 * AC2: Two distinct namespaces (project_ids) with same key → no collision.
 * AC3: Suite passes.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { LspCache } from '../core/lsp/lsp-cache.js'

function makeCache(): LspCache {
  const db = new Database(':memory:')
  return new LspCache(db)
}

describe('LspCache', () => {
  it('returns cached value when mtime matches (AC1)', () => {
    const cache = makeCache()
    cache.set('proj', 'key1', 'hover', 'typescript', 'a.ts', { result: 42 }, '100')
    const hit = cache.get('proj', 'key1', '100')
    expect(hit).toEqual({ result: 42 })
  })

  it('returns null when mtime differs (stale, AC1)', () => {
    const cache = makeCache()
    cache.set('proj', 'key1', 'hover', 'typescript', 'a.ts', { result: 42 }, '100')
    const miss = cache.get('proj', 'key1', '200')
    expect(miss).toBeNull()
  })

  it('returns null for unknown key', () => {
    const cache = makeCache()
    expect(cache.get('proj', 'no-such-key', '100')).toBeNull()
  })

  it('does not collide between different namespaces (AC2)', () => {
    const cache = makeCache()
    cache.set('ns1', 'same-key', 'hover', 'typescript', 'a.ts', 'value-ns1', '100')
    cache.set('ns2', 'same-key', 'hover', 'typescript', 'a.ts', 'value-ns2', '100')
    expect(cache.get('ns1', 'same-key', '100')).toBe('value-ns1')
    expect(cache.get('ns2', 'same-key', '100')).toBe('value-ns2')
  })

  it('updates cached value on re-set with same key', () => {
    const cache = makeCache()
    cache.set('proj', 'key1', 'hover', 'typescript', 'a.ts', 'old', '100')
    cache.set('proj', 'key1', 'hover', 'typescript', 'a.ts', 'new', '100')
    expect(cache.get('proj', 'key1', '100')).toBe('new')
  })
})
