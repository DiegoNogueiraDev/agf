/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/algorithms/string/suffix-array.ts
 */

import { describe, it, expect } from 'vitest'
import { suffixArray, suffixArraySearch } from '../core/algorithms/string/suffix-array.js'

describe('suffixArray', () => {
  it('builds a suffix array sorted in ordinal order (matches suffixArraySearch comparator)', () => {
    const result = suffixArray('banana')
    const sortedSuffixes = result.suffixArray.map((i) => result.text.slice(i))
    const expected = [...sortedSuffixes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    expect(sortedSuffixes).toEqual(expected)
  })
})

describe('suffixArraySearch', () => {
  it('finds the offset of an existing substring', () => {
    const result = suffixArray('the quick brown fox')
    const offset = suffixArraySearch(result, 'quick')
    expect(offset).toBe('the '.length)
  })

  it('returns -1 for a substring that is not present', () => {
    const result = suffixArray('the quick brown fox')
    expect(suffixArraySearch(result, 'slow')).toBe(-1)
  })

  it('finds a match in mixed-case text (regression: locale vs ordinal comparator mismatch)', () => {
    const text = 'Apple apple Apple apple banana Cherry cherry'
    const offset = suffixArraySearch(suffixArray(text), 'banana')
    expect(offset).toBe(text.indexOf('banana'))
  })

  it('finds a pattern that exists in the text', () => {
    const text = 'the quick brown fox jumps over the lazy dog'
    const sa = suffixArray(text)
    const idx = suffixArraySearch(sa, 'lazy dog')
    expect(idx).toBe(text.indexOf('lazy dog'))
  })

  it('returns -1 for a pattern that does not exist', () => {
    const sa = suffixArray('hello world')
    expect(suffixArraySearch(sa, 'xyz')).toBe(-1)
  })

  it('finds patterns adjacent to punctuation, underscores, and digits (sort/search order must agree)', () => {
    // Sorting by localeCompare and searching by ordinal `<` can disagree on the
    // relative order of '-', '_', '.', digits vs letters — if the two orders
    // diverge, the binary search invariant breaks and existing matches are
    // missed. Cover exactly that boundary.
    const parts = ['a b', 'a-b', 'a_b', 'a.b', 'a1b', 'aab', 'aAb']
    const text = parts.join(' ') + ' ' + parts.join('|')
    const sa = suffixArray(text)
    for (const pattern of parts) {
      const idx = suffixArraySearch(sa, pattern)
      expect(idx, `expected to find "${pattern}"`).not.toBe(-1)
      expect(text.slice(idx, idx + pattern.length)).toBe(pattern)
    }
  })

  it('finds a realistic dormant-module description snippet', () => {
    const text =
      'Dormant capability detected (no-surface): src/core/algorithms/string/suffix-array.ts. ' +
      'Wire it to at least one surface.'
    const sa = suffixArray(text)
    const idx = suffixArraySearch(sa, 'no-surface')
    expect(idx).toBe(text.indexOf('no-surface'))
  })
})
