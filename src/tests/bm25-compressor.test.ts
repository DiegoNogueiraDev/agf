import { describe, it, expect, afterEach } from 'vitest'
import { BM25_DEFAULTS, setBm25Config } from '../core/context/bm25-compressor.js'

afterEach(() => {
  // restore defaults after each test
  setBm25Config(BM25_DEFAULTS)
})

describe('BM25_DEFAULTS', () => {
  it('has expected k1, b, delta values', () => {
    expect(BM25_DEFAULTS.k1).toBe(1.8)
    expect(BM25_DEFAULTS.b).toBe(0.75)
    expect(BM25_DEFAULTS.delta).toBe(1.0)
  })

  it('is a readonly frozen config', () => {
    expect(BM25_DEFAULTS).toMatchObject({ k1: 1.8, b: 0.75, delta: 1.0 })
  })
})

describe('setBm25Config', () => {
  it('accepts partial override', () => {
    expect(() => setBm25Config({ k1: 2.0 })).not.toThrow()
  })

  it('accepts full override', () => {
    expect(() => setBm25Config({ k1: 1.2, b: 0.5, delta: 0.5 })).not.toThrow()
  })

  it('accepts empty partial (no-op)', () => {
    expect(() => setBm25Config({})).not.toThrow()
  })
})
