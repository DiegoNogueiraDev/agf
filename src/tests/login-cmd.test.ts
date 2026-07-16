/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/login-cmd.ts — loginCommand factory wiring.
 */

import { describe, it, expect } from 'vitest'
import { loginCommand } from '../cli/commands/login-cmd.js'

describe('loginCommand', () => {
  it('builds the "login" command with a description', () => {
    const cmd = loginCommand()
    expect(cmd.name()).toBe('login')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = loginCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
})
