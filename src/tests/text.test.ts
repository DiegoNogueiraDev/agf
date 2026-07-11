/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { normalizeNewlines } from '../core/utils/text.js'

describe('normalizeNewlines', () => {
  it('should convert \\\\n to actual newlines', () => {
    expect(normalizeNewlines('line1\\nline2')).toBe('line1\nline2')
  })

  it('should handle multiple escaped newlines', () => {
    expect(normalizeNewlines('a\\nb\\nc')).toBe('a\nb\nc')
  })

  it('should return string unchanged if no escaped newlines', () => {
    expect(normalizeNewlines('hello world')).toBe('hello world')
  })

  it('should return undefined when input is undefined', () => {
    expect(normalizeNewlines(undefined)).toBeUndefined()
  })

  it('should return empty string when input is empty string', () => {
    expect(normalizeNewlines('')).toBe('')
  })

  it('should not double-convert actual newlines', () => {
    expect(normalizeNewlines('hello\nworld')).toBe('hello\nworld')
  })

  it('should handle mixed escaped and actual newlines', () => {
    expect(normalizeNewlines('a\\nb\nc\\nd')).toBe('a\nb\nc\nd')
  })
})
