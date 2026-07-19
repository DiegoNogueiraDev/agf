/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/principles-cmd.ts — principlesCommand factory wiring.
 */

import { describe, it, expect } from 'vitest'
import { principlesCommand } from '../cli/commands/principles-cmd.js'

describe('principlesCommand', () => {
  it('builds the "principles" command with a description', () => {
    const cmd = principlesCommand()
    expect(cmd.name()).toBe('principles')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('wires 2 subcommands', () => {
    expect(principlesCommand().commands.length).toBe(2)
  })
})
