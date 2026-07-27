/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_4438172a8bf7 — C80-T1: tests for configToHandler null paths
 *
 * AC: returns null for non-shell kind; returns null for missing command;
 *     blast gate passes
 */

import { describe, it, expect } from 'vitest'
import { configToHandler } from '../core/hooks/rehydrate.js'
import type { HookHandlerConfig } from '../core/hooks/config-loader.js'

function makeConfig(overrides: Partial<HookHandlerConfig> = {}): HookHandlerConfig {
  return {
    id: 'test-hook',
    channel: 'task:post-complete',
    kind: 'shell',
    command: 'echo hello',
    ...overrides,
  } as HookHandlerConfig
}

describe('configToHandler', () => {
  it('returns null for kind=inline-unsafe', () => {
    const config = makeConfig({ kind: 'inline-unsafe' })
    expect(configToHandler(config)).toBeNull()
  })

  it('returns null for kind=module', () => {
    const config = makeConfig({ kind: 'module' })
    expect(configToHandler(config)).toBeNull()
  })

  it('returns null for kind=mjs-module', () => {
    const config = makeConfig({ kind: 'mjs-module' })
    expect(configToHandler(config)).toBeNull()
  })

  it('returns null when kind=shell but command is missing', () => {
    const config = makeConfig({ kind: 'shell', command: undefined })
    expect(configToHandler(config)).toBeNull()
  })

  it('returns null when kind=shell but command is empty string', () => {
    const config = makeConfig({ kind: 'shell', command: '' })
    expect(configToHandler(config)).toBeNull()
  })

  it('returns a function (handler) for valid shell config', () => {
    const config = makeConfig({ kind: 'shell', command: 'echo hello' })
    const handler = configToHandler(config)
    expect(typeof handler).toBe('function')
  })

  it('does not throw for non-shell kind', () => {
    expect(() => configToHandler(makeConfig({ kind: 'inline-unsafe' }))).not.toThrow()
  })

  it('does not throw for shell kind with missing command', () => {
    expect(() => configToHandler(makeConfig({ kind: 'shell', command: undefined }))).not.toThrow()
  })
})
