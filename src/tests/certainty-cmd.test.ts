/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * Tests for `agf certainty` command wiring (node_19809e400130). Drives the
 * command surface: it registers, exposes the <nodeId> arg, and its loader
 * resolves. The verdict logic itself is proven in delivery-certainty.test.ts;
 * here we assert the surface exists and is discoverable (outside-in wiring).
 */

import { describe, it, expect } from 'vitest'
import { certaintyCommand } from '../cli/commands/certainty-cmd.js'
import { commands } from '../cli/commands-list.js'

describe('agf certainty command', () => {
  it('builds a commander command named "certainty" with a required <nodeId> arg', () => {
    const cmd = certaintyCommand()
    expect(cmd.name()).toBe('certainty')
    // The registered argument is <nodeId> (required, angle-bracketed).
    const usage = cmd.usage()
    expect(usage).toContain('nodeId')
  })

  it('is registered in commands-list with a resolvable loader (discoverable surface)', async () => {
    const entry = commands.find((c) => c.name === 'certainty')
    expect(entry).toBeDefined()
    const built = await entry!.loader()
    expect(built.name()).toBe('certainty')
  })
})
