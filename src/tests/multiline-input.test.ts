/*!
 * TDD: multiline input helper — Ctrl-J inserts newline (node_6ba4e23489b7).
 *
 * AC1: Ctrl-J in the input inserts a newline and does NOT submit.
 * AC2: Enter submits (unchanged behavior — not handled by this helper).
 */

import { describe, it, expect } from 'vitest'
import { applyCtrlJ, isCtrlJ } from '../tui/multiline-input.js'

describe('AC1: isCtrlJ detects the key combination', () => {
  it('returns true for ctrl=true and input="j"', () => {
    expect(isCtrlJ('j', { ctrl: true })).toBe(true)
  })

  it('returns false for plain "j" without ctrl', () => {
    expect(isCtrlJ('j', { ctrl: false })).toBe(false)
  })

  it('returns false for ctrl=true with a different char', () => {
    expect(isCtrlJ('a', { ctrl: true })).toBe(false)
  })
})

describe('AC1: applyCtrlJ appends a newline to current value', () => {
  it('appends \\n to an empty string', () => {
    expect(applyCtrlJ('')).toBe('\n')
  })

  it('appends \\n to a non-empty value', () => {
    expect(applyCtrlJ('hello')).toBe('hello\n')
  })

  it('appends \\n even when value already ends with \\n', () => {
    expect(applyCtrlJ('line1\n')).toBe('line1\n\n')
  })
})
