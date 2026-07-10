/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { parseTerminalSize, type TerminalSize } from '../tui/terminal-size.js'

describe('parseTerminalSize', () => {
  it('returns size from stdout', () => {
    const stdout = { rows: 30, columns: 100 } as any
    const size: TerminalSize = parseTerminalSize(stdout)
    expect(size.rows).toBe(30)
    expect(size.columns).toBe(100)
  })

  it('returns fallback when stdout missing rows/columns', () => {
    const stdout = {} as any
    const size: TerminalSize = parseTerminalSize(stdout)
    expect(size.rows).toBe(24)
    expect(size.columns).toBe(80)
  })

  it('returns fallback when rows is 0', () => {
    const stdout = { rows: 0, columns: 0 } as any
    const size: TerminalSize = parseTerminalSize(stdout)
    expect(size.rows).toBe(24)
    expect(size.columns).toBe(80)
  })
})
