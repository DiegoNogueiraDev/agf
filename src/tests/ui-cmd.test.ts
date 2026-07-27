/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/ui-cmd.ts — uiCommand factory wiring.
 */

import { describe, it, expect } from 'vitest'
import { uiCommand } from '../cli/commands/ui-cmd.js'

describe('uiCommand', () => {
  it('builds the "ui" command with a description', () => {
    const cmd = uiCommand()
    expect(cmd.name()).toBe('ui')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = uiCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
})
