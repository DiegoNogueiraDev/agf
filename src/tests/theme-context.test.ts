/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { getThemeContext } from '../tui/theme/theme-context.js'
import { DEFAULT_THEME } from '../tui/theme/theme-loader.js'

describe('getThemeContext', () => {
  it('defaults to DEFAULT_THEME when no override is given', () => {
    expect(getThemeContext().theme).toEqual(DEFAULT_THEME)
  })

  it('uses the override theme when given', () => {
    const custom = { ...DEFAULT_THEME, name: 'custom' }
    expect(getThemeContext(custom).theme).toEqual(custom)
  })

  it('setTheme is a no-op outside React context (never throws)', () => {
    const ctx = getThemeContext()
    expect(() => ctx.setTheme(DEFAULT_THEME)).not.toThrow()
  })
})
