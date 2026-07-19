/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/hooks/enforcement-handlers.ts — wires hook-toml-config.ts
 * (node_wire_348c97952d23) so registerEnforcementHandlers also loads
 * .mcp-graph/hooks.toml at CLI startup, registering each [[hook]] block via
 * the SAME registerHook registry the hardcoded status-flow gate already uses.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerEnforcementHandlers } from '../core/hooks/enforcement-handlers.js'
import { _resetRegisteredHooks, registeredHookCount } from '../core/hooks/register-hook.js'

describe('registerEnforcementHandlers loads .mcp-graph/hooks.toml (node_wire_348c97952d23)', () => {
  let dir: string

  beforeEach(() => {
    _resetRegisteredHooks()
    dir = mkdtempSync(join(tmpdir(), 'agf-toml-hooks-'))
  })

  afterEach(() => {
    _resetRegisteredHooks()
    rmSync(dir, { recursive: true, force: true })
  })

  it('registers a hook per [[hook]] block when hooks.toml exists', () => {
    mkdirSync(join(dir, '.mcp-graph'), { recursive: true })
    writeFileSync(join(dir, '.mcp-graph', 'hooks.toml'), `[[hook]]\nchannel = "session:start"\ncommand = "echo hi"\n`)

    registerEnforcementHandlers(dir)

    expect(registeredHookCount('session:start')).toBe(1)
    // The hardcoded status-flow gate always registers regardless of the TOML file.
    expect(registeredHookCount('status:pre-change')).toBe(1)
  })

  it('registers only the hardcoded status-flow gate when no hooks.toml exists', () => {
    registerEnforcementHandlers(dir)

    expect(registeredHookCount('status:pre-change')).toBe(1)
    expect(registeredHookCount('session:start')).toBe(0)
  })

  it('does not throw and skips registration when hooks.toml is invalid', () => {
    mkdirSync(join(dir, '.mcp-graph'), { recursive: true })
    writeFileSync(join(dir, '.mcp-graph', 'hooks.toml'), `[[hook]]\nchannel = "not:a:real:channel"\n`)

    expect(() => registerEnforcementHandlers(dir)).not.toThrow()
    expect(registeredHookCount('status:pre-change')).toBe(1)
  })
})
