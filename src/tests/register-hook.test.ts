/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { _resetSharedHookBus } from '../core/hooks/shared-hook-bus.js'
import {
  registerHook,
  _resetRegisteredHooks,
  dispatchHookWithResult,
  getHandlerStats,
} from '../core/hooks/register-hook.js'
import { deny, halt, modify } from '../core/hooks/hook-types.js'
import { emitEconomyHook } from '../core/hooks/economy-lifecycle-hooks.js'
import { UnknownHookChannelError } from '../core/hooks/hook-types.js'

describe('registerHook — Task 3.2 programmatic API', () => {
  const prevEnv = process.env.AGF_HOOKS
  beforeEach(() => {
    _resetRegisteredHooks()
    _resetSharedHookBus()
    delete process.env.AGF_HOOKS
    delete process.env.MCP_GRAPH_HOOKS_DISABLED
  })
  afterEach(() => {
    _resetRegisteredHooks()
    _resetSharedHookBus()
    if (prevEnv === undefined) delete process.env.AGF_HOOKS
    else process.env.AGF_HOOKS = prevEnv
  })

  it('fires a registered handler when the channel is emitted (via the shared bus)', () => {
    const seen: string[] = []
    registerHook('cache:hit', (e) => {
      seen.push(String(e.payload.hash))
    })
    emitEconomyHook('on_cache_hit', { hash: 'abc' })
    expect(seen).toEqual(['abc'])
  })

  it('accepts any of the 28-taxonomy channels', () => {
    for (const ch of ['llm:pre-call', 'compress:post', 'gate:check', 'circuit:break', 'status:pre-change'] as const) {
      expect(() => registerHook(ch, () => {})).not.toThrow()
    }
  })

  it('runs multiple handlers on the same channel in priority order (lower = earlier)', () => {
    const order: string[] = []
    registerHook('cache:hit', () => order.push('b'), { priority: 10 })
    registerHook('cache:hit', () => order.push('a'), { priority: 1 })
    registerHook('cache:hit', () => order.push('c'), { priority: 20 })
    emitEconomyHook('on_cache_hit', { hash: 'x' })
    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('unregister stops the handler from firing', () => {
    let count = 0
    const off = registerHook('cache:miss', () => {
      count++
    })
    emitEconomyHook('on_cache_miss', { hash: 'x' })
    off()
    emitEconomyHook('on_cache_miss', { hash: 'x' })
    expect(count).toBe(1)
  })

  it('throws a typed error for an unknown channel', () => {
    expect(() => registerHook('does:not-exist', () => {})).toThrow(UnknownHookChannelError)
  })

  it('does not fire when AGF_HOOKS=0 (emit is suppressed)', () => {
    let count = 0
    registerHook('cache:hit', () => {
      count++
    })
    process.env.AGF_HOOKS = '0'
    emitEconomyHook('on_cache_hit', { hash: 'x' })
    expect(count).toBe(0)
  })
})

describe('dispatchHookWithResult — deny/halt enforcement (finding ea0f86630c0e)', () => {
  const prevEnv = process.env.AGF_HOOKS
  beforeEach(() => {
    _resetRegisteredHooks()
    _resetSharedHookBus()
    delete process.env.AGF_HOOKS
  })
  afterEach(() => {
    _resetRegisteredHooks()
    _resetSharedHookBus()
    if (prevEnv === undefined) delete process.env.AGF_HOOKS
    else process.env.AGF_HOOKS = prevEnv
  })

  it('returns allow when there are no handlers (byte-identical)', () => {
    expect(dispatchHookWithResult('status:pre-change', {}).action).toBe('allow')
  })

  it('returns deny when a handler denies', () => {
    registerHook('status:pre-change', () => deny('blocked by policy'))
    const r = dispatchHookWithResult('status:pre-change', { from: 'backlog', to: 'done' })
    expect(r.action).toBe('deny')
    expect(r.reason).toBe('blocked by policy')
  })

  it('halt wins over deny/modify (precedence)', () => {
    registerHook('status:pre-change', () => deny('x'))
    registerHook('status:pre-change', () => modify({ a: 1 }))
    registerHook('status:pre-change', () => halt('emergency'))
    expect(dispatchHookWithResult('status:pre-change', {}).action).toBe('halt')
  })

  it('ignores async handler returns (sync enforcement only)', () => {
    registerHook('status:pre-change', async () => deny('async-deny'))
    expect(dispatchHookWithResult('status:pre-change', {}).action).toBe('allow')
  })

  it('returns allow when AGF_HOOKS=0 (kill-switch)', () => {
    registerHook('status:pre-change', () => deny('x'))
    process.env.AGF_HOOKS = '0'
    expect(dispatchHookWithResult('status:pre-change', {}).action).toBe('allow')
  })
})

describe('getHandlerStats — per-handler observability (node_wire_7c1539516c86)', () => {
  const prevEnv = process.env.AGF_HOOKS
  beforeEach(() => {
    _resetRegisteredHooks()
    _resetSharedHookBus()
    delete process.env.AGF_HOOKS
  })
  afterEach(() => {
    _resetRegisteredHooks()
    _resetSharedHookBus()
    if (prevEnv === undefined) delete process.env.AGF_HOOKS
    else process.env.AGF_HOOKS = prevEnv
  })

  it('records a successful synchronous call under the handler id', () => {
    registerHook('cache:hit', () => undefined, { id: 'my-handler' })
    emitEconomyHook('on_cache_hit', { hash: 'abc' })
    const stats = getHandlerStats()
    const entry = stats.find((s) => s.handlerId === 'my-handler')
    expect(entry).toBeDefined()
    expect(entry?.callCount).toBe(1)
    expect(entry?.errorCount).toBe(0)
  })

  it('records a failed synchronous call with the thrown message', () => {
    registerHook(
      'cache:hit',
      () => {
        throw new Error('boom')
      },
      { id: 'failing-handler' },
    )
    emitEconomyHook('on_cache_hit', { hash: 'abc' })
    const stats = getHandlerStats()
    const entry = stats.find((s) => s.handlerId === 'failing-handler')
    expect(entry?.callCount).toBe(1)
    expect(entry?.errorCount).toBe(1)
    expect(entry?.lastError).toBe('boom')
  })

  it('falls back to the channel name as handlerId when no id is given', () => {
    registerHook('cache:miss', () => undefined)
    emitEconomyHook('on_cache_miss', { hash: 'x' })
    const stats = getHandlerStats()
    expect(stats.find((s) => s.handlerId === 'cache:miss')).toBeDefined()
  })

  it('accumulates callCount across multiple emissions', () => {
    registerHook('cache:hit', () => undefined, { id: 'counter' })
    emitEconomyHook('on_cache_hit', { hash: 'a' })
    emitEconomyHook('on_cache_hit', { hash: 'b' })
    emitEconomyHook('on_cache_hit', { hash: 'c' })
    const entry = getHandlerStats().find((s) => s.handlerId === 'counter')
    expect(entry?.callCount).toBe(3)
  })

  it('is empty right after _resetRegisteredHooks', () => {
    registerHook('cache:hit', () => undefined, { id: 'temp' })
    emitEconomyHook('on_cache_hit', { hash: 'a' })
    _resetRegisteredHooks()
    expect(getHandlerStats()).toEqual([])
  })
})
