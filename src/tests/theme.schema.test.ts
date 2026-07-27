/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { themeSchema, syntaxSchema } from '../tui/theme/theme.schema.js'

const validSyntax = {
  keyword: '#ff0000',
  string: '#00ff00',
  comment: '#0000ff',
  function: '#ffff00',
  variable: '#ff00ff',
  number: '#00ffff',
}

const validTheme = {
  name: 'default',
  primary: '#e7a44b',
  accent: '#c9a468',
  success: '#86b86a',
  warning: '#d97a35',
  error: '#e08a5a',
  text: '#f0ead9',
  textMuted: '#cabfa6',
  background: '#3a3122',
  surface: '#0b0a07',
  border: 'rgba(255, 255, 255, 0.1)',
  syntax: validSyntax,
}

describe('themeSchema', () => {
  it('parses a fully valid theme', () => {
    expect(() => themeSchema.parse(validTheme)).not.toThrow()
  })

  it('accepts rgba() for the border token, not just hex', () => {
    const result = themeSchema.parse(validTheme)
    expect(result.border).toBe('rgba(255, 255, 255, 0.1)')
  })

  it('rejects an empty theme name', () => {
    expect(() => themeSchema.parse({ ...validTheme, name: '' })).toThrow()
  })

  it('rejects a color token that is neither hex nor rgb(a)', () => {
    expect(() => themeSchema.parse({ ...validTheme, primary: 'not-a-color' })).toThrow()
  })

  it('rejects a theme missing the syntax block', () => {
    const { syntax: _syntax, ...withoutSyntax } = validTheme
    expect(() => themeSchema.parse(withoutSyntax)).toThrow()
  })
})

describe('syntaxSchema', () => {
  it('parses a fully valid syntax token set', () => {
    expect(() => syntaxSchema.parse(validSyntax)).not.toThrow()
  })

  it('rejects an invalid color on any syntax token', () => {
    expect(() => syntaxSchema.parse({ ...validSyntax, keyword: 'red' })).toThrow()
  })
})
