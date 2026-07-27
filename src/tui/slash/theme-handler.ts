/*!
 * /theme slash command handler — list|use|show theme operations.
 *
 * WHY: user-facing theme control without a restart. Reuses theme-loader
 * to list bundled and user themes, and validate the selected name.
 * Pure function (no side effects): caller manages context swap.
 *
 * Composes with: theme-loader.ts (resolveTheme, DEFAULT_THEME), dispatch-catalog.ts.
 */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_THEME, loadThemeFile } from '../theme/theme-loader.js'
import type { Theme } from '../theme/theme.schema.js'

export interface ThemeCommandResult {
  ok: boolean
  themes?: Array<{ name: string; source: 'bundled' | 'user' }>
  theme?: Theme
  error?: string
}

/** Handle /theme <subcommand> [...args]. Returns a typed result — never throws. */
export function handleThemeCommand(args: string[], themesDir: string): ThemeCommandResult {
  const [sub, name] = args

  if (sub === 'list' || !sub) {
    return buildList(themesDir)
  }

  if (sub === 'show') {
    return { ok: true, theme: DEFAULT_THEME }
  }

  if (sub === 'use') {
    if (!name) return { ok: false, error: 'usage: /theme use <name>' }
    const path = join(themesDir, `${name}.json`)
    if (!existsSync(path)) {
      return { ok: false, error: `Theme "${name}" not found in ${themesDir}` }
    }
    try {
      const theme = loadThemeFile(path)
      return { ok: true, theme }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  }

  return { ok: false, error: `Unknown /theme subcommand: ${sub}. Use list|use|show.` }
}

function buildList(themesDir: string): ThemeCommandResult {
  const bundled = [{ name: DEFAULT_THEME.name, source: 'bundled' as const }]
  if (!existsSync(themesDir)) return { ok: true, themes: bundled }

  const userThemes = readdirSync(themesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ name: f.replace(/\.json$/, ''), source: 'user' as const }))

  return { ok: true, themes: [...bundled, ...userThemes] }
}
