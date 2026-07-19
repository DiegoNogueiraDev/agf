/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/colony-health-cmd.ts — colonyHealthCommand factory wiring.
 */

import { describe, it, expect } from 'vitest'
import { colonyHealthCommand } from '../cli/commands/colony-health-cmd.js'

describe('colonyHealthCommand', () => {
  it('builds the "colony-health" command with a description', () => {
    const cmd = colonyHealthCommand()
    expect(cmd.name()).toBe('colony-health')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = colonyHealthCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
})
