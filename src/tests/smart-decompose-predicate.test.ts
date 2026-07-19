/*!
 * Tests for smart-decompose.ts — shouldSuggestDecomposition predicate.
 *
 * Pure boolean function with no DB or LLM dependency.
 * Covers all branches: large/non-large sizes, AC count, child task count.
 */

import { describe, it, expect } from 'vitest'
import { shouldSuggestDecomposition } from '../core/planner/smart-decompose.js'

describe('shouldSuggestDecomposition', () => {
  describe('size guard', () => {
    it('returns true for L size with sufficient ACs and no children', () => {
      expect(shouldSuggestDecomposition('L', 2, 0)).toBe(true)
    })

    it('returns true for XL size with sufficient ACs and no children', () => {
      expect(shouldSuggestDecomposition('XL', 3, 0)).toBe(true)
    })

    it('returns false for M size even with sufficient ACs', () => {
      expect(shouldSuggestDecomposition('M', 5, 0)).toBe(false)
    })

    it('returns false for S size', () => {
      expect(shouldSuggestDecomposition('S', 3, 0)).toBe(false)
    })

    it('returns false for XS size', () => {
      expect(shouldSuggestDecomposition('XS', 4, 0)).toBe(false)
    })

    it('returns false for null xpSize', () => {
      expect(shouldSuggestDecomposition(null, 3, 0)).toBe(false)
    })

    it('returns false for undefined xpSize', () => {
      expect(shouldSuggestDecomposition(undefined, 3, 0)).toBe(false)
    })

    it('returns false for unknown xpSize string', () => {
      expect(shouldSuggestDecomposition('XXL', 3, 0)).toBe(false)
    })
  })

  describe('AC count guard', () => {
    it('returns false when acCount is 0', () => {
      expect(shouldSuggestDecomposition('L', 0, 0)).toBe(false)
    })

    it('returns false when acCount is 1 (below minimum)', () => {
      expect(shouldSuggestDecomposition('L', 1, 0)).toBe(false)
    })

    it('returns true when acCount meets the minimum threshold', () => {
      expect(shouldSuggestDecomposition('L', 2, 0)).toBe(true)
    })

    it('returns true when acCount is well above minimum', () => {
      expect(shouldSuggestDecomposition('XL', 8, 0)).toBe(true)
    })
  })

  describe('child task count guard', () => {
    it('returns false when childTaskCount > 0 (task already has children)', () => {
      expect(shouldSuggestDecomposition('L', 3, 1)).toBe(false)
    })

    it('returns false when childTaskCount is large', () => {
      expect(shouldSuggestDecomposition('XL', 5, 10)).toBe(false)
    })

    it('returns true only when childTaskCount is exactly 0', () => {
      expect(shouldSuggestDecomposition('L', 2, 0)).toBe(true)
    })
  })
})
