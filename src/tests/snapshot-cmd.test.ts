/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/snapshot-cmd.ts — snapshotCommand factory wiring.
 */

import { describe, it, expect } from 'vitest'
import { snapshotCommand } from '../cli/commands/snapshot-cmd.js'

describe('snapshotCommand', () => {
  it('builds the "snapshot" command with a description', () => {
    const cmd = snapshotCommand()
    expect(cmd.name()).toBe('snapshot')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('wires 3 subcommands', () => {
    expect(snapshotCommand().commands.length).toBe(3)
  })
})
