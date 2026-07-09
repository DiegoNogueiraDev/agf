import { describe, it, expect } from 'vitest'
import { isValidStrategy, decideRoute, ROUTING_STRATEGIES } from '../core/learning/routing-strategy.js'

describe('isValidStrategy', () => {
  it('accepts known strategies', () => {
    for (const s of ROUTING_STRATEGIES) {
      expect(isValidStrategy(s)).toBe(true)
    }
  })

  it('rejects unknown strategy', () => {
    expect(isValidStrategy('unknown')).toBe(false)
  })

  it('rejects non-string values', () => {
    expect(isValidStrategy(42)).toBe(false)
    expect(isValidStrategy(null)).toBe(false)
  })
})

describe('decideRoute — manual strategy', () => {
  it('returns fallback=true for manual strategy with no records', () => {
    const result = decideRoute({ strategy: 'manual', records: [] })
    expect(result.strategy).toBe('manual')
    expect(result.fallback).toBe(true)
  })

  it('uses manual as default when strategy is omitted', () => {
    const result = decideRoute({ records: [] })
    expect(result.strategy).toBe('manual')
    expect(result.fallback).toBe(true)
  })
})

describe('decideRoute — sona strategy', () => {
  it('falls back when insufficient records', () => {
    const result = decideRoute({ strategy: 'sona', records: [] })
    expect(result.strategy).toBe('sona')
    expect(result.fallback).toBe(true)
  })
})

describe('decideRoute — hybrid strategy', () => {
  it('uses hybrid fallback on cold start', () => {
    const result = decideRoute({ strategy: 'hybrid', records: [] })
    expect(result.strategy).toBe('hybrid')
    expect(result.fallback).toBe(true)
  })
})
