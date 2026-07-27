/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/caste-cmd.ts — casteCommand factory wiring.
 */

import { describe, it, expect } from 'vitest'
import { casteCommand } from '../cli/commands/caste-cmd.js'

describe('casteCommand', () => {
  it('builds the "caste" command with a description', () => {
    const cmd = casteCommand()
    expect(cmd.name()).toBe('caste')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('wires 2 subcommands', () => {
    expect(casteCommand().commands.length).toBe(2)
  })
})
