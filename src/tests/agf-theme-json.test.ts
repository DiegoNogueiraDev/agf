/*!
 * TDD: agf.json default theme + ANSI fallback map (node_e973ac7a6503).
 *
 * AC1: agf.json parsed → exact palette token values.
 * AC2: ANSI fallback map covers 16-color and 256-color degradation without crash.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadTheme } from '../tui/theme/theme-loader.js'
import { ANSI_FALLBACK_MAP, toAnsiFallback } from '../tui/theme/ansi-fallback.js'

const AGF_JSON_PATH = join(import.meta.dirname, '../../src/tui/theme/agf.json')

describe('AC1: agf.json exact palette', () => {
  it('parses agf.json and has correct token values', () => {
    const raw = JSON.parse(readFileSync(AGF_JSON_PATH, 'utf-8'))
    const theme = loadTheme(raw)
    expect(theme.primary).toBe('#e7a44b')
    expect(theme.success).toBe('#86b86a')
    expect(theme.error).toBe('#e08a5a')
    expect(theme.background).toBe('#3a3122')
    expect(theme.surface).toBe('#0b0a07')
  })
})

describe('AC2: ANSI fallback map covers 16/256-color terminals', () => {
  it('ANSI_FALLBACK_MAP has entries for primary, success, error, background, surface', () => {
    expect(ANSI_FALLBACK_MAP).toHaveProperty('primary')
    expect(ANSI_FALLBACK_MAP).toHaveProperty('success')
    expect(ANSI_FALLBACK_MAP).toHaveProperty('error')
    expect(ANSI_FALLBACK_MAP).toHaveProperty('background')
    expect(ANSI_FALLBACK_MAP).toHaveProperty('surface')
  })

  it('toAnsiFallback returns a string for each key without crashing', () => {
    for (const key of Object.keys(ANSI_FALLBACK_MAP)) {
      const result = toAnsiFallback(key as keyof typeof ANSI_FALLBACK_MAP)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    }
  })
})
