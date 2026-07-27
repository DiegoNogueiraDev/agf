/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_75b845cd1994 — Semantic theme schema + loader: a single typed source of
 * color truth. loadTheme() validates JSON into a typed Theme; resolveTheme() falls
 * back to the bundled agf default when no user theme is present.
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { loadTheme, resolveTheme, DEFAULT_THEME, ThemeError } from '../tui/theme/theme-loader.js'

const validJson = JSON.stringify({ ...DEFAULT_THEME, name: 'custom' })

describe('loadTheme', () => {
  it('returns a typed Theme with all tokens resolved from valid JSON', () => {
    const theme = loadTheme(JSON.parse(validJson))
    expect(theme.name).toBe('custom')
    expect(theme.primary).toBe(DEFAULT_THEME.primary)
    expect(theme.syntax.keyword).toBe(DEFAULT_THEME.syntax.keyword)
  })

  it('throws a ThemeError naming the field when a required token is missing', () => {
    const broken = JSON.parse(validJson)
    delete broken.accent
    expect(() => loadTheme(broken)).toThrow(ThemeError)
    try {
      loadTheme(broken)
    } catch (e) {
      expect((e as ThemeError).message).toContain('accent')
    }
  })

  it('throws a ThemeError when a color token has an invalid value', () => {
    const broken = { ...JSON.parse(validJson), error: 'not-a-color' }
    expect(() => loadTheme(broken)).toThrow(ThemeError)
  })
})

describe('resolveTheme — bundled default fallback', () => {
  it('loads the bundled agf default when no user theme is present', () => {
    const empty = mkdtempSync(join(tmpdir(), 'agf-themes-'))
    try {
      const theme = resolveTheme(join(empty, '.agf', 'themes'))
      expect(theme).toEqual(DEFAULT_THEME)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('loads a user theme JSON when present in the themes dir', () => {
    const root = mkdtempSync(join(tmpdir(), 'agf-themes-'))
    const dir = join(root, '.agf', 'themes')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'mine.json'), validJson)
    try {
      const theme = resolveTheme(dir, 'mine')
      expect(theme.name).toBe('custom')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
