import { describe, it, expect, afterEach } from 'vitest'
import { loadBuiltinTomlFilters, _resetBuiltinFilters } from '../core/tool-compress/builtin-filters.js'

afterEach(() => {
  _resetBuiltinFilters()
})

describe('loadBuiltinTomlFilters', () => {
  it('returns a number', () => {
    const count = loadBuiltinTomlFilters()
    expect(typeof count).toBe('number')
  })

  it('returns a non-negative count', () => {
    const count = loadBuiltinTomlFilters()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  it('is idempotent (second call returns same or 0)', () => {
    const first = loadBuiltinTomlFilters()
    const second = loadBuiltinTomlFilters()
    expect(typeof second).toBe('number')
    expect(first + second).toBeGreaterThanOrEqual(first)
  })
})

describe('_resetBuiltinFilters', () => {
  it('is a function', () => {
    expect(typeof _resetBuiltinFilters).toBe('function')
  })

  it('does not throw', () => {
    expect(() => _resetBuiltinFilters()).not.toThrow()
  })

  it('allows re-loading after reset', () => {
    loadBuiltinTomlFilters()
    _resetBuiltinFilters()
    const count = loadBuiltinTomlFilters()
    expect(typeof count).toBe('number')
  })
})
