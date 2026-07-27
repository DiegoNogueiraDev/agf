/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/import-graph-cmd.ts — importGraphCommand factory wiring.
 */

import { describe, it, expect } from 'vitest'
import { importGraphCommand } from '../cli/commands/import-graph-cmd.js'

describe('importGraphCommand', () => {
  it('builds the "import-graph" command with a description', () => {
    const cmd = importGraphCommand()
    expect(cmd.name()).toBe('import-graph')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = importGraphCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
})
