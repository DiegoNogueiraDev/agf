import { describe, it, expect } from 'vitest'
import { BloomFilter } from '../core/cache/bloom-filter.js'

describe('BloomFilter', () => {
  it('always returns false for keys never added', () => {
    const bf = new BloomFilter(100, 0.01)
    expect(bf.mightContain('hello')).toBe(false)
    expect(bf.mightContain('world')).toBe(false)
  })

  it('returns true after a key is added', () => {
    const bf = new BloomFilter(100, 0.01)
    bf.add('hello')
    expect(bf.mightContain('hello')).toBe(true)
  })

  it('tracks approximate count', () => {
    const bf = new BloomFilter(100, 0.01)
    expect(bf.approximateCount()).toBe(0)
    bf.add('a')
    bf.add('b')
    bf.add('c')
    expect(bf.approximateCount()).toBe(3)
  })

  it('clear resets the filter', () => {
    const bf = new BloomFilter(100, 0.01)
    bf.add('hello')
    bf.clear()
    expect(bf.mightContain('hello')).toBe(false)
    expect(bf.approximateCount()).toBe(0)
  })

  it('handles many distinct keys without false negatives', () => {
    const bf = new BloomFilter(200, 0.01)
    const keys = Array.from({ length: 100 }, (_, i) => `key-${i}`)
    keys.forEach((k) => bf.add(k))
    for (const k of keys) {
      expect(bf.mightContain(k)).toBe(true)
    }
  })

  it('does not crash on empty string key', () => {
    const bf = new BloomFilter(10, 0.05)
    expect(() => bf.add('')).not.toThrow()
    expect(bf.mightContain('')).toBe(true)
  })
})
