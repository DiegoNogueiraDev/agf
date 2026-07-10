import { describe, it, expect } from 'vitest'
import {
  knapsack01,
  longestCommonSubsequence,
  editDistance,
  longestPalindrome,
} from '../core/algorithms/dynamic-programming.js'

describe('knapsack01', () => {
  it('returns totalValue=0 for empty items', () => {
    const result = knapsack01([], 10)
    expect(result.totalValue).toBe(0)
    expect(result.selected).toEqual([])
  })

  it('selects the highest-value item that fits', () => {
    const items = [
      { weight: 5, value: 10 },
      { weight: 3, value: 7 },
    ]
    const result = knapsack01(items, 5)
    expect(result.totalValue).toBe(10)
  })

  it('maximizes value within capacity by combining items', () => {
    const items = [
      { weight: 2, value: 6 },
      { weight: 2, value: 4 },
      { weight: 4, value: 7 },
    ]
    const result = knapsack01(items, 4)
    expect(result.totalValue).toBe(10) // items 0+1: weight=4, value=10
  })

  it('totalWeight does not exceed capacity', () => {
    const items = [
      { weight: 3, value: 4 },
      { weight: 5, value: 8 },
      { weight: 2, value: 3 },
    ]
    const result = knapsack01(items, 6)
    expect(result.totalWeight).toBeLessThanOrEqual(6)
  })
})

describe('longestCommonSubsequence', () => {
  it('returns length=0 for two empty strings', () => {
    const result = longestCommonSubsequence('', '')
    expect(result.length).toBe(0)
  })

  it('returns length=0 when no common characters', () => {
    const result = longestCommonSubsequence('abc', 'xyz')
    expect(result.length).toBe(0)
  })

  it('returns correct length for classic example ABCBDAB vs BDCAB', () => {
    const result = longestCommonSubsequence('ABCBDAB', 'BDCAB')
    expect(result.length).toBe(4)
  })

  it('handles identical strings — LCS is the string itself', () => {
    const result = longestCommonSubsequence('hello', 'hello')
    expect(result.length).toBe(5)
  })
})

describe('editDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(editDistance('abc', 'abc').distance).toBe(0)
  })

  it('returns length of b when a is empty', () => {
    expect(editDistance('', 'hello').distance).toBe(5)
  })

  it('returns length of a when b is empty', () => {
    expect(editDistance('hello', '').distance).toBe(5)
  })

  it('computes Levenshtein distance for kitten→sitting', () => {
    expect(editDistance('kitten', 'sitting').distance).toBe(3)
  })
})

describe('longestPalindrome', () => {
  it('returns single char for single char input', () => {
    expect(longestPalindrome('a')).toBe('a')
  })

  it('finds palindrome in string', () => {
    const result = longestPalindrome('babad')
    expect(['bab', 'aba']).toContain(result)
  })

  it('returns the whole string for a palindrome input', () => {
    expect(longestPalindrome('racecar')).toBe('racecar')
  })
})
