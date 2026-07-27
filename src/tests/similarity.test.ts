/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { tokenize, jaccardSimilarity } from '../core/utils/similarity.js'

describe('tokenize', () => {
  it('should split camelCase', () => {
    expect(tokenize('helloWorld')).toEqual(['hello', 'world'])
  })

  it('should split PascalCase', () => {
    expect(tokenize('HelloWorld')).toEqual(['hello', 'world'])
  })

  it('should split snake_case', () => {
    expect(tokenize('hello_world')).toEqual(['hello', 'world'])
  })

  it('should split kebab-case', () => {
    expect(tokenize('hello-world')).toEqual(['hello', 'world'])
  })

  it('should filter single-character tokens', () => {
    expect(tokenize('a b c hello')).toEqual(['hello'])
  })

  it('should lowercase all tokens', () => {
    expect(tokenize('HelloWORLD')).toEqual(['hello', 'world'])
  })

  it('should return empty array for single-char input', () => {
    expect(tokenize('a')).toEqual([])
  })

  it('should handle empty string', () => {
    expect(tokenize('')).toEqual([])
  })

  it('should handle mixed separators', () => {
    expect(tokenize('getUser_byId')).toEqual(['get', 'user', 'by', 'id'])
  })
})

describe('jaccardSimilarity', () => {
  it('should return 1 for identical sets', () => {
    const a = new Set(['a', 'b', 'c'])
    expect(jaccardSimilarity(a, a)).toBe(1)
  })

  it('should return 0 for disjoint sets', () => {
    const a = new Set(['a', 'b'])
    const b = new Set(['c', 'd'])
    expect(jaccardSimilarity(a, b)).toBe(0)
  })

  it('should return correct value for partially overlapping sets', () => {
    const a = new Set(['a', 'b', 'c'])
    const b = new Set(['b', 'c', 'd'])
    // intersection = {b, c} = 2, union = {a, b, c, d} = 4, sim = 2/4 = 0.5
    expect(jaccardSimilarity(a, b)).toBe(0.5)
  })

  it('should return 0 for empty sets', () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(0)
  })

  it('should return 0 when one set is empty', () => {
    const a = new Set(['a', 'b'])
    expect(jaccardSimilarity(a, new Set())).toBe(0)
    expect(jaccardSimilarity(new Set(), a)).toBe(0)
  })
})
