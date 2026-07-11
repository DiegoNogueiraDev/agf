/*!
 * TDD: /theme slash command (node_b960bc201af8).
 *
 * AC1: /theme list returns bundled + user themes.
 * AC2: /theme use <missing> returns a typed error and does not crash.
 */

import { describe, it, expect } from 'vitest'
import { handleThemeCommand } from '../tui/slash/theme-handler.js'

describe('AC1: /theme list', () => {
  it('returns at least the bundled agf-default theme in the list', () => {
    const result = handleThemeCommand(['list'], '/tmp/no-themes')
    expect(result.ok).toBe(true)
    expect(result.themes).toBeDefined()
    expect(Array.isArray(result.themes)).toBe(true)
    const names = result.themes!.map((t: { name: string }) => t.name)
    expect(names).toContain('agf-default')
  })
})

describe('AC2: /theme use <missing>', () => {
  it('returns ok:false with a typed error when theme not found', () => {
    const result = handleThemeCommand(['use', 'nonexistent-theme'], '/tmp/no-themes')
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error).toMatch(/not found/i)
  })

  it('does not throw — error is returned as a value', () => {
    expect(() => handleThemeCommand(['use', 'missing'], '/tmp/no-themes')).not.toThrow()
  })
})
