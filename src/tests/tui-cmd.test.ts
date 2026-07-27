/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/tui-cmd.ts — tuiCommand factory wiring.
 */

import { describe, it, expect } from 'vitest'
import { tuiCommand } from '../cli/commands/tui-cmd.js'

describe('tuiCommand', () => {
  it('builds the "tui" command with a description', () => {
    const cmd = tuiCommand()
    expect(cmd.name()).toBe('tui')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = tuiCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
})
