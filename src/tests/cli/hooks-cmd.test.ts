/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { listHooks, discoverUnhandled } from '../../cli/commands/hooks-cmd.js'

describe('hooks-cmd — listHooks', () => {
  it('retorna array com entradas da taxonomia', () => {
    const hooks = listHooks()
    expect(Array.isArray(hooks)).toBe(true)
    expect(hooks.length).toBeGreaterThan(0)
  })

  it('cada entrada tem point, channel, module e capability', () => {
    for (const h of listHooks()) {
      expect(h).toHaveProperty('point')
      expect(h).toHaveProperty('channel')
      expect(h).toHaveProperty('module')
      expect(h).toHaveProperty('capability')
    }
  })

  it('inclui llm:pre-call na taxonomia', () => {
    const channels = listHooks().map((h) => h.channel)
    expect(channels).toContain('llm:pre-call')
  })
})

describe('hooks-cmd — discoverUnhandled', () => {
  it('retorna array de canais (pode ser vazia se todos têm handler)', () => {
    const unhandled = discoverUnhandled()
    expect(Array.isArray(unhandled)).toBe(true)
  })
})
