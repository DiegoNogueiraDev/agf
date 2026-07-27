/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/provider-cmd.ts — providerCommand factory wiring.
 */

import { describe, it, expect } from 'vitest'
import { providerCommand } from '../cli/commands/provider-cmd.js'

describe('providerCommand', () => {
  it('builds the "provider" command with a description', () => {
    const cmd = providerCommand()
    expect(cmd.name()).toBe('provider')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('wires 5 subcommands', () => {
    expect(providerCommand().commands.length).toBe(5)
  })
})
