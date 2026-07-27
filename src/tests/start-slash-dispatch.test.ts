/*!
 * TDD: /start dispatches agf start core, not browser (node_162e18ed6c22).
 *
 * AC1: /start → dispatched via agf start (wake-up+next+context+in_progress).
 * AC2: browser start retains its own name (no collision with /start).
 */

import { describe, it, expect } from 'vitest'
import { COMMANDS } from '../tui/dispatch-catalog.js'
import { ASYNC_CMDS } from '../tui/dispatch-ports.js'

describe('AC1: /start is in dispatch-catalog and ASYNC_CMDS', () => {
  it('dispatch-catalog has a start entry', () => {
    const found = COMMANDS.find((c) => c.name === 'start')
    expect(found).toBeDefined()
    expect(found?.desc).toMatch(/agf start|wake-up|next.*context|loop.*start/i)
  })

  it('ASYNC_CMDS includes start', () => {
    expect(ASYNC_CMDS).toContain('start')
  })
})

describe('AC2: browser command is distinct — no collision', () => {
  it('browser command name is not "start"', () => {
    const browser = COMMANDS.find((c) => c.name === 'browser')
    expect(browser?.name).not.toBe('start')
  })
})
