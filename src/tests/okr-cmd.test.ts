/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * Wiring tests for `agf okr` (node_6334980fc7eb). O veredito em si é provado em
 * okr-report.test.ts / okr-status.test.ts; aqui garante-se que a SUPERFÍCIE
 * existe e é descobrível — um cockpit que ninguém alcança entrega zero.
 */

import { describe, it, expect } from 'vitest'
import { okrCommand } from '../cli/commands/okr-cmd.js'
import { commands } from '../cli/commands-list.js'

describe('agf okr command', () => {
  it('builds a commander command named "okr" with the --at-risk filter', () => {
    const cmd = okrCommand()
    expect(cmd.name()).toBe('okr')
    expect(cmd.options.some((o) => o.long === '--at-risk')).toBe(true)
  })

  it('is registered in commands-list with a resolvable loader (discoverable)', async () => {
    const entry = commands.find((c) => c.name === 'okr')
    expect(entry).toBeDefined()
    const built = await entry!.loader()
    expect(built.name()).toBe('okr')
  })
})
