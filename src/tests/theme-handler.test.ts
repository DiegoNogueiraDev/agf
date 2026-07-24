/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleThemeCommand } from '../tui/slash/theme-handler.js'
import { DEFAULT_THEME } from '../tui/theme/theme-loader.js'

describe('handleThemeCommand', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-theme-handler-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('list: returns the bundled default theme when the themes dir does not exist', () => {
    const result = handleThemeCommand(['list'], join(dir, 'does-not-exist'))
    expect(result.ok).toBe(true)
    expect(result.themes).toEqual([{ name: DEFAULT_THEME.name, source: 'bundled' }])
  })

  it('list: includes user themes found in the themes dir', () => {
    writeFileSync(join(dir, 'my-theme.json'), JSON.stringify(DEFAULT_THEME))
    const result = handleThemeCommand(['list'], dir)
    expect(result.themes).toContainEqual({ name: 'my-theme', source: 'user' })
  })

  it('no subcommand defaults to list', () => {
    const result = handleThemeCommand([], dir)
    expect(result.ok).toBe(true)
    expect(result.themes).toBeDefined()
  })

  it('show: returns the default theme', () => {
    const result = handleThemeCommand(['show'], dir)
    expect(result.ok).toBe(true)
    expect(result.theme).toEqual(DEFAULT_THEME)
  })

  it('use: requires a theme name', () => {
    const result = handleThemeCommand(['use'], dir)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('usage:')
  })

  it('use: reports not found for a missing theme file', () => {
    const result = handleThemeCommand(['use', 'nonexistent'], dir)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('use: loads a valid theme file by name', () => {
    writeFileSync(join(dir, 'custom.json'), JSON.stringify(DEFAULT_THEME))
    const result = handleThemeCommand(['use', 'custom'], dir)
    expect(result.ok).toBe(true)
    expect(result.theme?.name).toBe(DEFAULT_THEME.name)
  })

  it('use: reports an error (not a throw) for a malformed theme file', () => {
    writeFileSync(join(dir, 'broken.json'), 'not valid json')
    const result = handleThemeCommand(['use', 'broken'], dir)
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('unknown subcommand returns a usage error', () => {
    const result = handleThemeCommand(['bogus'], dir)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('Unknown /theme subcommand')
  })
})
