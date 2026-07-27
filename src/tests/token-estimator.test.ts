/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { estimateTokens } from '../core/context/token-estimator.js'

describe('token-estimator', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('counts short ASCII words as 1 token', () => {
    expect(estimateTokens('hello world')).toBe(2)
  })

  it('counts longer words at ceil(len/5)', () => {
    const tokens = estimateTokens('extraordinarily')
    expect(tokens).toBeGreaterThanOrEqual(2)
  })

  it('counts very long words at ceil(len/4)', () => {
    const word = 'a'.repeat(25)
    const tokens = estimateTokens(word)
    expect(tokens).toBe(7)
  })

  it('counts camelCase as multiple sub-words', () => {
    const tokens = estimateTokens('camelCaseWord')
    expect(tokens).toBeGreaterThan(1)
  })

  it('counts numbers at ceil(digits/3)', () => {
    const tokens = estimateTokens('123456')
    expect(tokens).toBe(2)
  })

  it('counts symbols as 1 token each', () => {
    const tokens = estimateTokens('!@#$%')
    expect(tokens).toBe(5)
  })

  it('counts mixed content', () => {
    const tokens = estimateTokens('Hello world! 123 test.')
    expect(tokens).toBeGreaterThan(0)
  })

  it('counts each word separately regardless of whitespace', () => {
    const twoWords = estimateTokens('a  b')
    const threeWords = estimateTokens('x   y   z')
    expect(twoWords).toBe(2)
    expect(threeWords).toBe(3)
  })

  it('produces deterministic results', () => {
    const text = 'The quick brown fox jumps over the lazy dog.'
    expect(estimateTokens(text)).toBe(estimateTokens(text))
  })
})
