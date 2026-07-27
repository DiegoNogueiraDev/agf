/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { _resetSharedHookBus } from '../core/hooks/shared-hook-bus.js'
import { _resetRegisteredHooks, registeredHookCount } from '../core/hooks/register-hook.js'
import { emitEconomyHook } from '../core/hooks/economy-lifecycle-hooks.js'
import { UnknownHookChannelError } from '../core/hooks/hook-types.js'
import {
  parseHookTomlConfig,
  exitCodeToAction,
  loadHookTomlConfig,
  HookTomlConfigError,
} from '../core/hooks/hook-toml-config.js'

describe('parseHookTomlConfig — Sub 3.1a (parse + schema)', () => {
  it('parses a valid [[hook]] table array', () => {
    const cfg = parseHookTomlConfig(`
[[hook]]
channel = "llm:pre-call"
command = "echo hi"

[[hook]]
channel = "cache:hit"
command = "./guard.sh"
priority = 5
`)
    expect(cfg.hook).toHaveLength(2)
    expect(cfg.hook[0]).toMatchObject({ channel: 'llm:pre-call', command: 'echo hi' })
    expect(cfg.hook[1]).toMatchObject({ channel: 'cache:hit', command: './guard.sh', priority: 5 })
  })

  it('throws HookTomlConfigError on invalid TOML', () => {
    expect(() => parseHookTomlConfig('this is = = not toml [[[')).toThrow(HookTomlConfigError)
  })

  it('throws UnknownHookChannelError when a hook targets an unknown channel', () => {
    expect(() =>
      parseHookTomlConfig(`
[[hook]]
channel = "does:not-exist"
command = "x"
`),
    ).toThrow(UnknownHookChannelError)
  })

  it('accepts an empty config (no hooks)', () => {
    expect(parseHookTomlConfig('').hook).toEqual([])
  })

  it('accepts an entry with a valid matcher filter (node_wire_bc013a2b96fe)', () => {
    const cfg = parseHookTomlConfig(`
[[hook]]
channel = "tool:pre-call"
command = "echo bash-only"
matcher = "toolName:Bash"
`)
    expect(cfg.hook[0].matcher).toBe('toolName:Bash')
  })

  it('throws HookTomlConfigError on invalid matcher syntax', () => {
    expect(() =>
      parseHookTomlConfig(`
[[hook]]
channel = "tool:pre-call"
command = "x"
matcher = "no-colon-here"
`),
    ).toThrow(HookTomlConfigError)
  })
})

describe('exitCodeToAction — Sub 3.1b (exit-code/action protocol)', () => {
  it('maps 0=allow, 1=passthrough(record), 2=deny, 3=ask', () => {
    expect(exitCodeToAction(0).action).toBe('allow')
    expect(exitCodeToAction(1).action).toBe('record')
    expect(exitCodeToAction(2).action).toBe('deny')
    expect(exitCodeToAction(2).reason).toBeDefined()
    expect(exitCodeToAction(3).action).toBe('deny')
    expect(exitCodeToAction(99).action).toBe('record')
  })
})

describe('loadHookTomlConfig — Sub 3.1c (load + error handling)', () => {
  beforeEach(() => {
    _resetRegisteredHooks()
    _resetSharedHookBus()
    delete process.env.AGF_HOOKS
  })
  afterEach(() => {
    _resetRegisteredHooks()
    _resetSharedHookBus()
  })

  it('registers a handler per hook and fires it on emit (injected runner)', () => {
    const calls: Array<{ cmd: string; channel: string }> = []
    const { count } = loadHookTomlConfig(
      `
[[hook]]
channel = "cache:hit"
command = "./guard.sh"
`,
      {
        runner: (cmd, event) => {
          calls.push({ cmd, channel: event.channel })
          return 2
        },
      },
    )
    expect(count).toBe(1)
    expect(registeredHookCount('cache:hit')).toBe(1)
    emitEconomyHook('on_cache_hit', { hash: 'abc' })
    expect(calls).toEqual([{ cmd: './guard.sh', channel: 'cache:hit' }])
  })

  it('unregisterAll removes the handlers', () => {
    let count = 0
    const { unregisterAll } = loadHookTomlConfig(
      `
[[hook]]
channel = "cache:miss"
command = "x"
`,
      { runner: () => (count++, 0) },
    )
    unregisterAll()
    emitEconomyHook('on_cache_miss', { hash: 'x' })
    expect(count).toBe(0)
  })

  it('does not crash on invalid config — throws a typed error', () => {
    expect(() => loadHookTomlConfig('garbage = = [[[')).toThrow(HookTomlConfigError)
  })

  it('matcher.ts filters events: runner only fires when the filter matches (node_wire_bc013a2b96fe)', async () => {
    const { dispatchHookWithResult } = await import('../core/hooks/register-hook.js')
    const calls: string[] = []
    loadHookTomlConfig(
      `
[[hook]]
channel = "tool:pre-call"
command = "x"
matcher = "toolName:Bash"
`,
      { runner: (cmd) => (calls.push(cmd), 0) },
    )
    // Non-matching toolName — runner must NOT fire.
    dispatchHookWithResult('tool:pre-call', { toolName: 'Read' })
    expect(calls).toHaveLength(0)
    // Matching toolName — runner fires.
    dispatchHookWithResult('tool:pre-call', { toolName: 'Bash' })
    expect(calls).toEqual(['x'])
  })
})
