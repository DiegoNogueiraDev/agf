/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/hooks/enforcement-handlers.ts — wires config-loader.ts +
 * rehydrate.ts's configToHandler (node_wire_d27379c4257b) so
 * registerEnforcementHandlers also loads .mcp-graph/hooks.json at CLI
 * startup, registering each kind=shell entry via the SAME registerHook
 * registry the hardcoded status-flow gate already uses.
 *
 * .mcp-graph/hooks.json is the ACTUAL persistence target of every
 * `agf hooks import-*` provider command (aider/codex/copilot/opencode/
 * claude-code) — before this wire, nothing loaded it back at CLI startup,
 * so every imported hook was persisted and never activated.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerEnforcementHandlers } from '../core/hooks/enforcement-handlers.js'
import { _resetRegisteredHooks, registeredHookCount } from '../core/hooks/register-hook.js'

describe('registerEnforcementHandlers loads .mcp-graph/hooks.json (node_wire_d27379c4257b)', () => {
  let dir: string

  beforeEach(() => {
    _resetRegisteredHooks()
    dir = mkdtempSync(join(tmpdir(), 'agf-json-hooks-'))
  })

  afterEach(() => {
    _resetRegisteredHooks()
    rmSync(dir, { recursive: true, force: true })
  })

  it('registers a hook per kind=shell entry when hooks.json exists', () => {
    mkdirSync(join(dir, '.mcp-graph'), { recursive: true })
    writeFileSync(
      join(dir, '.mcp-graph', 'hooks.json'),
      JSON.stringify({
        version: 1,
        hooks: {
          'session:start': [
            {
              id: 'imported-1',
              channel: 'session:start',
              kind: 'shell',
              command: '/bin/sh',
              commandArgs: ['-c', 'echo hi'],
              enabled: true,
            },
          ],
        },
      }),
    )

    registerEnforcementHandlers(dir)

    expect(registeredHookCount('session:start')).toBe(1)
    // The hardcoded status-flow gate always registers regardless of the JSON file.
    expect(registeredHookCount('status:pre-change')).toBe(1)
  })

  it('registers only the hardcoded status-flow gate when no hooks.json exists', () => {
    registerEnforcementHandlers(dir)

    expect(registeredHookCount('status:pre-change')).toBe(1)
    expect(registeredHookCount('session:start')).toBe(0)
  })

  it('does not throw and skips silently when hooks.json is invalid JSON', () => {
    mkdirSync(join(dir, '.mcp-graph'), { recursive: true })
    writeFileSync(join(dir, '.mcp-graph', 'hooks.json'), 'not valid json {{{')

    expect(() => registerEnforcementHandlers(dir)).not.toThrow()
    expect(registeredHookCount('status:pre-change')).toBe(1)
  })

  it('registers one handler per channel across multiple imported hooks (e.g. a real agf hooks import-* output)', () => {
    mkdirSync(join(dir, '.mcp-graph'), { recursive: true })
    writeFileSync(
      join(dir, '.mcp-graph', 'hooks.json'),
      JSON.stringify({
        version: 1,
        hooks: {
          'tool:pre-call': [
            {
              id: 'copilot-pretooluse-0-0',
              channel: 'tool:pre-call',
              kind: 'shell',
              command: '/bin/sh',
              commandArgs: ['-c', 'echo pre'],
              enabled: true,
            },
          ],
          'tool:post-call': [
            {
              id: 'codex-tool_call-0-0',
              channel: 'tool:post-call',
              kind: 'shell',
              command: '/bin/sh',
              commandArgs: ['-c', 'echo post'],
              enabled: true,
            },
          ],
        },
      }),
    )

    registerEnforcementHandlers(dir)

    expect(registeredHookCount('tool:pre-call')).toBe(1)
    expect(registeredHookCount('tool:post-call')).toBe(1)
  })
})
