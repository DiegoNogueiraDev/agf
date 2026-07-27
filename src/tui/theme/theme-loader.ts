/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_75b845cd1994 — Theme loader: validates user JSON into a typed {@link Theme}
 * via {@link themeSchema}, and resolves the active theme from `.agf/themes/*.json`
 * with a bundled agf default fallback. Pure + injectable (the themes dir is a param),
 * so it stays testable without touching the real filesystem layout.
 *
 * Contract: `loadTheme(json) -> Theme`; a missing/invalid token throws a
 * {@link ThemeError} naming the offending field. Owning module for the Theme shape
 * is ./theme.schema.ts.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GraphError } from '../../core/errors/graph-error.js'
import { themeSchema, type Theme } from './theme.schema.js'

/** Typed error for theme validation failures — names the failing field in the message. */
export class ThemeError extends GraphError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super(message, context)
    this.name = 'ThemeError'
  }
}

/**
 * Bundled agf default theme. Source palette: the project's warm amber accent.
 * This is the fallback when no user theme is present.
 */
export const DEFAULT_THEME: Theme = {
  name: 'agf-default',
  primary: '#e7a44b',
  accent: '#c9a468',
  success: '#86b86a',
  warning: '#d97a35',
  error: '#e08a5a',
  text: '#f0ead9',
  textMuted: '#cabfa6',
  background: '#3a3122',
  surface: '#0b0a07',
  border: 'rgba(231,164,75,.26)',
  syntax: {
    keyword: '#e7a44b',
    string: '#86b86a',
    comment: '#cabfa6',
    function: '#c9a468',
    variable: '#f0ead9',
    number: '#d97a35',
  },
}

/**
 * Validate arbitrary JSON into a typed Theme. Throws {@link ThemeError} naming the
 * first failing field when a required token is missing or malformed.
 */
export function loadTheme(json: unknown): Theme {
  const result = themeSchema.safeParse(json)
  if (!result.success) {
    const issue = result.error.issues[0]
    const field = issue?.path.join('.') || '(root)'
    throw new ThemeError(`Invalid theme: field "${field}" — ${issue?.message ?? 'invalid'}`, {
      field,
      issues: result.error.issues,
    })
  }
  return result.data
}

/** Read and validate a single theme JSON file. Throws {@link ThemeError} on bad JSON or schema. */
export function loadThemeFile(path: string): Theme {
  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch (e) {
    throw new ThemeError(`Cannot read theme file: ${path}`, { path, cause: String(e) })
  }
  try {
    return loadTheme(JSON.parse(raw))
  } catch (e) {
    if (e instanceof ThemeError) throw e
    throw new ThemeError(`Theme file is not valid JSON: ${path}`, { path, cause: String(e) })
  }
}

/**
 * Resolve the active theme. If `name` is given, loads `<themesDir>/<name>.json`.
 * Otherwise loads the first `*.json` found in `themesDir`. When the directory is
 * absent or empty, returns the bundled {@link DEFAULT_THEME}.
 */
export function resolveTheme(themesDir: string, name?: string): Theme {
  if (!existsSync(themesDir)) return DEFAULT_THEME

  if (name) {
    const path = join(themesDir, `${name}.json`)
    return existsSync(path) ? loadThemeFile(path) : DEFAULT_THEME
  }

  const first = readdirSync(themesDir).find((f) => f.endsWith('.json'))
  return first ? loadThemeFile(join(themesDir, first)) : DEFAULT_THEME
}
