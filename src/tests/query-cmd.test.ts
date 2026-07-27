/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/query-cmd.ts — queryCommand factory wiring.
 */

import { describe, it, expect } from 'vitest'
import { queryCommand } from '../cli/commands/query-cmd.js'

describe('queryCommand', () => {
  it('builds the "query" command with a description', () => {
    const cmd = queryCommand()
    expect(cmd.name()).toBe('query')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = queryCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
})
