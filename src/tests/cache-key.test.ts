import { describe, it, expect } from 'vitest'
import { canonicalJson, buildCacheKey } from '../core/economy/cache/cache-key.js'

describe('canonicalJson', () => {
  it('serializes primitives', () => {
    expect(canonicalJson(42)).toBe('42')
    expect(canonicalJson('hello')).toBe('"hello"')
    expect(canonicalJson(null)).toBe('null')
    expect(canonicalJson(true)).toBe('true')
  })

  it('sorts object keys', () => {
    const result = canonicalJson({ z: 1, a: 2, m: 3 })
    const parsed = JSON.parse(result)
    expect(Object.keys(parsed)).toEqual(['a', 'm', 'z'])
  })

  it('handles arrays', () => {
    expect(canonicalJson([1, 2, 3])).toBe('[1,2,3]')
  })

  it('is deterministic regardless of insertion order', () => {
    const obj1 = { b: 2, a: 1 }
    const obj2 = { a: 1, b: 2 }
    expect(canonicalJson(obj1)).toBe(canonicalJson(obj2))
  })
})

describe('buildCacheKey', () => {
  it('returns a 64-char hex string', () => {
    const key = buildCacheKey({ toolName: 'search', args: { q: 'test' }, schemaVersion: 1 })
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })

  it('same inputs produce same key', () => {
    const input = { toolName: 'tool', args: { x: 1 }, schemaVersion: 2 }
    expect(buildCacheKey(input)).toBe(buildCacheKey(input))
  })

  it('different args produce different keys', () => {
    const k1 = buildCacheKey({ toolName: 'tool', args: { x: 1 }, schemaVersion: 1 })
    const k2 = buildCacheKey({ toolName: 'tool', args: { x: 2 }, schemaVersion: 1 })
    expect(k1).not.toBe(k2)
  })
})
