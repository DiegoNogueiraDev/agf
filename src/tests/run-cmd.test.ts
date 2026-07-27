/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/run-cmd.ts — runCommand factory wiring.
 */

import { describe, it, expect } from 'vitest'
import { runCommand } from '../cli/commands/run-cmd.js'

describe('runCommand', () => {
  it('builds the "run" command with a description', () => {
    const cmd = runCommand()
    expect(cmd.name()).toBe('run')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = runCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
})
