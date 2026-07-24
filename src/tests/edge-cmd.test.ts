/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/edge-cmd.ts — edgeCommand factory wiring.
 */

import { describe, it, expect } from 'vitest'
import { edgeCommand } from '../cli/commands/edge-cmd.js'

describe('edgeCommand', () => {
  it('builds the "edge" command with a description', () => {
    const cmd = edgeCommand()
    expect(cmd.name()).toBe('edge')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('wires 3 subcommands', () => {
    expect(edgeCommand().commands.length).toBe(3)
  })
})
