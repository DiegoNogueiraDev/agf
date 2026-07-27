import { describe, it, expect } from 'vitest'
import { cavemanFilter, shouldCavemanFilter, getCavemanMode, getReductionTarget } from '../core/llm/caveman-filter.js'

describe('cavemanFilter', () => {
  it('returns empty string for empty input', () => {
    expect(cavemanFilter('')).toBe('')
  })

  it('strips filler words in aggressive mode', () => {
    const result = cavemanFilter('This is basically a test', 'aggressive')
    expect(result).not.toContain('basically')
  })

  it('returns shorter or equal output than input', () => {
    const input = 'Actually, this is really just a very simple example of essentially verbose text.'
    const result = cavemanFilter(input, 'aggressive')
    expect(result.length).toBeLessThanOrEqual(input.length)
  })

  it('returns a string in light mode', () => {
    expect(typeof cavemanFilter('Hello world', 'light')).toBe('string')
  })

  it('returns non-empty output for non-empty input', () => {
    const result = cavemanFilter('important data here')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('shouldCavemanFilter', () => {
  it('returns true when caveman is true', () => {
    expect(shouldCavemanFilter({ caveman: true })).toBe(true)
  })

  it('returns false when caveman is false', () => {
    expect(shouldCavemanFilter({ caveman: false })).toBe(false)
  })

  it('returns false when caveman is null', () => {
    expect(shouldCavemanFilter({ caveman: null })).toBe(false)
  })
})

describe('getCavemanMode', () => {
  it('returns aggressive for null cavemanMode', () => {
    expect(getCavemanMode({ cavemanMode: null })).toBe('aggressive')
  })

  it('returns the specified mode when set', () => {
    expect(getCavemanMode({ cavemanMode: 'light' })).toBe('light')
    expect(getCavemanMode({ cavemanMode: 'medium' })).toBe('medium')
  })
})

describe('getReductionTarget', () => {
  it('returns a number between 0 and 1', () => {
    for (const mode of ['light', 'medium', 'aggressive'] as const) {
      const target = getReductionTarget(mode)
      expect(target).toBeGreaterThan(0)
      expect(target).toBeLessThanOrEqual(1)
    }
  })
})
