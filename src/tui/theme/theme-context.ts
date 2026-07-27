/*!
 * ThemeContext — thin context carrier for the active theme.
 *
 * WHY: Components must source all colors from the theme, never hardcode hex.
 * This module provides the context shape and a factory used by ThemeProvider
 * (React context) and by tests (via getThemeContext with optional override).
 *
 * Composes with: theme-loader.ts (DEFAULT_THEME, Theme), agf.json (bundled palette).
 */

import { DEFAULT_THEME } from './theme-loader.js'
import type { Theme } from './theme.schema.js'

export interface ThemeContext {
  readonly theme: Theme
  /** Swap the active theme; triggers re-render in React context consumers. */
  readonly setTheme: (theme: Theme) => void
}

/** Factory used in tests and static contexts. Returns an immutable snapshot. */
export function getThemeContext(override?: Theme): ThemeContext {
  const theme = override ?? DEFAULT_THEME
  return {
    theme,
    setTheme: () => {
      /* no-op outside React context */
    },
  }
}
