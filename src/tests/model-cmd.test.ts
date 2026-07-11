/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/model-cmd.ts — modelCommand factory wiring.
 */

import { describe, it, expect } from 'vitest'
import { modelCommand } from '../cli/commands/model-cmd.js'

describe('modelCommand', () => {
  it('builds the "model" command with a description', () => {
    const cmd = modelCommand()
    expect(cmd.name()).toBe('model')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('wires 4 subcommands', () => {
    expect(modelCommand().commands.length).toBe(4)
  })
})
