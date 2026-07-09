/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/stats-cmd.ts — statsCommand factory wiring.
 */

import { describe, it, expect } from 'vitest'
import { statsCommand } from '../cli/commands/stats-cmd.js'

describe('statsCommand', () => {
  it('builds the "stats" command with a description', () => {
    const cmd = statsCommand()
    expect(cmd.name()).toBe('stats')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = statsCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
})
