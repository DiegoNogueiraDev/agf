/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/decompose-cmd.ts — decomposeCommand factory wiring.
 */

import { describe, it, expect } from 'vitest'
import { decomposeCommand } from '../cli/commands/decompose-cmd.js'

describe('decomposeCommand', () => {
  it('builds the "decompose" command with a description', () => {
    const cmd = decomposeCommand()
    expect(cmd.name()).toBe('decompose')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = decomposeCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
})
