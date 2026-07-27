/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { toAnsiFallback, ANSI_FALLBACK_MAP } from '../tui/theme/ansi-fallback.js'

describe('toAnsiFallback', () => {
  it('returns the mapped ANSI color for every known theme token', () => {
    for (const key of Object.keys(ANSI_FALLBACK_MAP) as Array<keyof typeof ANSI_FALLBACK_MAP>) {
      expect(toAnsiFallback(key)).toBe(ANSI_FALLBACK_MAP[key])
    }
  })

  it('maps error/warning tokens to red (no orange in 16-color)', () => {
    expect(toAnsiFallback('error')).toBe('red')
    expect(toAnsiFallback('warning')).toBe('red')
  })

  it('maps background/surface tokens to black', () => {
    expect(toAnsiFallback('background')).toBe('black')
    expect(toAnsiFallback('surface')).toBe('black')
  })
})
