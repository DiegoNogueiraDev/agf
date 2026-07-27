/*!
 * TDD: ThemeProvider + useTheme hook (node_6815013ac6fe).
 *
 * AC1: ThemeProvider + useTheme hook exist and provide the active theme.
 * AC2: Zero hardcoded hex colors in src/tui/*.tsx (structural enforcement).
 */

import { describe, it, expect } from 'vitest'
import { DEFAULT_THEME } from '../tui/theme/theme-loader.js'
import { getThemeContext } from '../tui/theme/theme-context.js'

describe('AC1: ThemeProvider context exports the active theme', () => {
  it('getThemeContext returns the default theme', () => {
    const ctx = getThemeContext()
    expect(ctx.theme.primary).toBe(DEFAULT_THEME.primary)
    expect(ctx.theme.success).toBe(DEFAULT_THEME.success)
  })

  it('getThemeContext with override returns the overridden theme', () => {
    const override = { ...DEFAULT_THEME, primary: '#ff0000' }
    const ctx = getThemeContext(override)
    expect(ctx.theme.primary).toBe('#ff0000')
  })
})

describe('AC2: no hardcoded hex colors in src/tui/*.tsx files', () => {
  it('grep finds 0 hex color literals in tsx files', async () => {
    const { execSync } = await import('node:child_process')
    let result: string
    try {
      result = execSync('grep -rn "color=[\'\\"]#[0-9a-fA-F]" src/tui/ --include="*.tsx" 2>/dev/null || true', {
        cwd: process.cwd(),
        encoding: 'utf-8',
      })
    } catch {
      result = ''
    }
    expect(result.trim()).toBe('')
  })
})
