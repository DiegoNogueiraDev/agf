/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/build-cmd.ts — buildCommand factory wiring.
 */

import { describe, it, expect } from 'vitest'
import { buildCommand } from '../cli/commands/build-cmd.js'

describe('buildCommand', () => {
  it('builds the "build" command with a description', () => {
    const cmd = buildCommand()
    expect(cmd.name()).toBe('build')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = buildCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
})
