/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { safeParseInt } from '../core/utils/parse-query.js'

describe('safeParseInt', () => {
  const opts = { defaultValue: 10, min: 1, max: 100 }

  it('should return default value when raw is undefined', () => {
    const result = safeParseInt(undefined, opts)
    expect(result.value).toBe(10)
    expect(result.error).toBeUndefined()
  })

  it('should return default value when raw is empty string', () => {
    const result = safeParseInt('', opts)
    expect(result.value).toBe(10)
    expect(result.error).toBeUndefined()
  })

  it('should parse valid integer string', () => {
    const result = safeParseInt('42', opts)
    expect(result.value).toBe(42)
    expect(result.error).toBeUndefined()
  })

  it('should return error for non-numeric string', () => {
    const result = safeParseInt('abc', opts)
    expect(result.value).toBe(10)
    expect(result.error).toContain('Expected integer')
    expect(result.error).toContain('abc')
  })

  it('should return error for value below minimum', () => {
    const result = safeParseInt('0', opts)
    expect(result.value).toBe(10)
    expect(result.error).toContain('below minimum')
  })

  it('should return error for value above maximum', () => {
    const result = safeParseInt('101', opts)
    expect(result.value).toBe(10)
    expect(result.error).toContain('exceeds maximum')
  })

  it('should accept value at minimum bound', () => {
    const result = safeParseInt('1', opts)
    expect(result.value).toBe(1)
    expect(result.error).toBeUndefined()
  })

  it('should accept value at maximum bound', () => {
    const result = safeParseInt('100', opts)
    expect(result.value).toBe(100)
    expect(result.error).toBeUndefined()
  })

  it('should work without min/max bounds', () => {
    const result = safeParseInt('999', { defaultValue: 0 })
    expect(result.value).toBe(999)
    expect(result.error).toBeUndefined()
  })
})
