/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Smoke tests for token-economy-file.ts — verifies the module loads and
 * the global file exists and is readable. Full integration coverage comes
 * from lazy-loader.ts middleware (every agf command invocation).
 */
import { describe, it, expect } from 'vitest'

describe('token-economy-file', () => {
  it('module loads and exports expected functions', async () => {
    const mod = await import('../core/economy/token-economy-file.js')
    expect(typeof mod.readEconomyFile).toBe('function')
    expect(typeof mod.incrementCommand).toBe('function')
    expect(typeof mod.incrementLlm).toBe('function')
    expect(typeof mod.readProjectBlock).toBe('function')
    expect(typeof mod.writeEconomyFile).toBe('function')
    expect(mod.ECONOMY_FILE).toContain('.config')
  })

  it('readEconomyFile returns valid structure', async () => {
    const { readEconomyFile } = await import('../core/economy/token-economy-file.js')
    const data = readEconomyFile()
    expect(data).toHaveProperty('started')
    expect(data).toHaveProperty('updated')
    expect(data).toHaveProperty('projects')
    expect(data).toHaveProperty('global_totals')
    expect(data.global_totals).toHaveProperty('projects')
    expect(data.global_totals).toHaveProperty('cmd_calls')
    expect(data.global_totals).toHaveProperty('combined_tok')
    expect(data.global_totals).toHaveProperty('cost')
  })

  it('readProjectBlock returns undefined for nonexistent path', async () => {
    const { readProjectBlock } = await import('../core/economy/token-economy-file.js')
    const block = readProjectBlock('/tmp/does-not-exist-' + Date.now())
    expect(block).toBeUndefined()
  })
})
