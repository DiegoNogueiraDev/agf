/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { truncateWithMarker } from '../core/context/truncate.js'

describe('truncate', () => {
  it('passes through short text', () => {
    const text = 'short text'
    expect(truncateWithMarker(text, 1000)).toBe(text)
  })

  it('returns exact text when length equals maxChars', () => {
    const text = 'exactly twenty chars!!'
    expect(truncateWithMarker(text, text.length)).toBe(text)
  })

  it('inserts omission marker for long text', () => {
    const text = 'a'.repeat(200)
    const result = truncateWithMarker(text, 50)
    expect(result).toContain('[omitido')
    expect(result).toContain('chars]')
  })

  it('preserves head and tail', () => {
    const head = 'HEAD'.repeat(10)
    const tail = 'TAIL'.repeat(10)
    const text = head + 'MIDDLE' + tail
    const result = truncateWithMarker(text, 40)
    expect(result).toContain('HEAD')
    expect(result).toContain('TAIL')
  })

  it('handles single-char text', () => {
    expect(truncateWithMarker('a', 1)).toBe('a')
  })

  it('handles text longer than maxChars with 40% head fraction', () => {
    const result = truncateWithMarker('Hello World! This is a test of the truncation function.', 20)
    const lines = result.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('[omitido')
  })

  it('handles zero maxChars gracefully', () => {
    const result = truncateWithMarker('some text', 0)
    expect(result).toContain('[omitido')
  })
})
