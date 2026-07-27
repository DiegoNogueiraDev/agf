/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/gc-cmd.ts — gcCommand factory wiring.
 */

import { describe, it, expect } from 'vitest'
import { gcCommand } from '../cli/commands/gc-cmd.js'

describe('gcCommand', () => {
  it('builds the "gc" command with a description', () => {
    const cmd = gcCommand()
    expect(cmd.name()).toBe('gc')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = gcCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
})
