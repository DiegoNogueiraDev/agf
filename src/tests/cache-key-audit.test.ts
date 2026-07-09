/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { canonicalJson, buildCacheKey } from '../core/economy/cache/cache-key.js'
import { fnv1a32, fnv1a64 } from '../core/cache/cache-types.js'

describe('canonicalJson stability', () => {
  it('produces same output for different key order', () => {
    const a = { b: 1, a: 2 }
    const b = { a: 2, b: 1 }
    expect(canonicalJson(a)).toBe(canonicalJson(b))
  })

  it('recursively sorts nested keys', () => {
    const a = { z: { c: 1, b: 2 }, y: 3 }
    const b = { y: 3, z: { b: 2, c: 1 } }
    expect(canonicalJson(a)).toBe(canonicalJson(b))
  })

  it('handles arrays (does not sort them)', () => {
    const a = { items: [3, 1, 2], id: 'x' }
    const b = { id: 'x', items: [3, 1, 2] }
    expect(canonicalJson(a)).toBe(canonicalJson(b))
  })

  it('handles null and primitives', () => {
    expect(canonicalJson(null)).toBe('null')
    expect(canonicalJson(42)).toBe('42')
    expect(canonicalJson('abc')).toBe('"abc"')
  })

  it('is idempotent across calls', () => {
    const obj = { name: 'test', value: 42, tags: ['a', 'b'] }
    const r1 = canonicalJson(obj)
    const r2 = canonicalJson(obj)
    expect(r1).toBe(r2)
  })
})

describe('buildCacheKey stability', () => {
  it('same inputs produce same key', () => {
    const k1 = buildCacheKey({ toolName: 'list', args: { type: 'task' }, schemaVersion: 1 })
    const k2 = buildCacheKey({ toolName: 'list', args: { type: 'task' }, schemaVersion: 1 })
    expect(k1).toBe(k2)
  })

  it('different args order produces same key', () => {
    const k1 = buildCacheKey({ toolName: 'list', args: { a: 1, b: 2 }, schemaVersion: 1 })
    const k2 = buildCacheKey({ toolName: 'list', args: { b: 2, a: 1 }, schemaVersion: 1 })
    expect(k1).toBe(k2)
  })

  it('different schemaVersion changes key', () => {
    const k1 = buildCacheKey({ toolName: 'list', args: {}, schemaVersion: 1 })
    const k2 = buildCacheKey({ toolName: 'list', args: {}, schemaVersion: 2 })
    expect(k1).not.toBe(k2)
  })

  it('model field is optional and defaults to null', () => {
    const k1 = buildCacheKey({ toolName: 'x', args: {}, schemaVersion: 1 })
    const k2 = buildCacheKey({ toolName: 'x', args: {}, schemaVersion: 1, model: undefined })
    expect(k1).toBe(k2)
  })

  it('returns 64-char hex', () => {
    const key = buildCacheKey({ toolName: 'test', args: { foo: 1 }, schemaVersion: 1 })
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('fnv1a32 determinism', () => {
  it('produces consistent output', () => {
    const r1 = fnv1a32('hello')
    const r2 = fnv1a32('hello')
    expect(r1).toBe(r2)
  })

  it('different inputs produce different hashes', () => {
    expect(fnv1a32('hello')).not.toBe(fnv1a32('world'))
  })

  it('returns 8-char zero-padded hex', () => {
    expect(fnv1a32('a')).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe('fnv1a64 determinism', () => {
  it('produces consistent output', () => {
    const r1 = fnv1a64('hello')
    const r2 = fnv1a64('hello')
    expect(r1).toBe(r2)
  })

  it('returns 16-char zero-padded hex', () => {
    expect(fnv1a64('a')).toMatch(/^[0-9a-f]{16}$/)
  })
})
