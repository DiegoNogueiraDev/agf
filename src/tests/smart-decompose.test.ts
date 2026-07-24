import { describe, it, expect } from 'vitest'
import { shouldSuggestDecomposition } from '../core/planner/smart-decompose.js'

describe('shouldSuggestDecomposition', () => {
  it('returns true for L size with ≥2 AC and no children', () => {
    expect(shouldSuggestDecomposition('L', 2, 0)).toBe(true)
  })

  it('returns true for XL size with ≥2 AC and no children', () => {
    expect(shouldSuggestDecomposition('XL', 3, 0)).toBe(true)
  })

  it('returns false for S size (not large)', () => {
    expect(shouldSuggestDecomposition('S', 3, 0)).toBe(false)
  })

  it('returns false for M size', () => {
    expect(shouldSuggestDecomposition('M', 3, 0)).toBe(false)
  })

  it('returns false when acCount < 2', () => {
    expect(shouldSuggestDecomposition('L', 1, 0)).toBe(false)
  })

  it('returns false when childTaskCount > 0 (already decomposed)', () => {
    expect(shouldSuggestDecomposition('L', 3, 1)).toBe(false)
  })

  it('returns false for null size', () => {
    expect(shouldSuggestDecomposition(null, 3, 0)).toBe(false)
  })

  it('returns false for undefined size', () => {
    expect(shouldSuggestDecomposition(undefined, 3, 0)).toBe(false)
  })
})
