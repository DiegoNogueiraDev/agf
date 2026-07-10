/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/profile-cmd.ts — profileCommand factory wiring.
 */

import { describe, it, expect } from 'vitest'
import { profileCommand } from '../cli/commands/profile-cmd.js'

describe('profileCommand', () => {
  it('builds the "profile" command with a description', () => {
    const cmd = profileCommand()
    expect(cmd.name()).toBe('profile')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('wires 2 subcommands', () => {
    expect(profileCommand().commands.length).toBe(2)
  })
})
