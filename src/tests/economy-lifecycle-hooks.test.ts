/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getSharedHookBus, _resetSharedHookBus } from '../core/hooks/shared-hook-bus.js'
import { emitEconomyHook } from '../core/hooks/economy-lifecycle-hooks.js'
import type { HookEvent } from '../core/hooks/hook-types.js'

describe('emitEconomyHook — Task 2.3 economy-phase dispatch', () => {
  const prevEnv = process.env.AGF_HOOKS
  beforeEach(() => {
    _resetSharedHookBus()
    delete process.env.AGF_HOOKS
    delete process.env.MCP_GRAPH_HOOKS_DISABLED
  })
  afterEach(() => {
    _resetSharedHookBus()
    if (prevEnv === undefined) delete process.env.AGF_HOOKS
    else process.env.AGF_HOOKS = prevEnv
  })

  it('dispatches handler with typed payload on the resolved channel', () => {
    const seen: HookEvent[] = []
    getSharedHookBus().on('compress:post', async (e) => {
      seen.push(e)
    })
    emitEconomyHook('post_compress', { lever: 'compress', saved: 120, savedPct: 30 })
    expect(seen).toHaveLength(1)
    expect(seen[0].channel).toBe('compress:post')
    expect(seen[0].payload).toMatchObject({ lever: 'compress', saved: 120 })
  })

  it('resolves each economy point to its channel', () => {
    const hits: string[] = []
    for (const ch of ['compress:pre', 'compress:post', 'cache:hit', 'cache:miss', 'budget:warning'] as const) {
      getSharedHookBus().on(ch, async () => {
        hits.push(ch)
      })
    }
    emitEconomyHook('pre_compress', {})
    emitEconomyHook('post_compress', {})
    emitEconomyHook('on_cache_hit', {})
    emitEconomyHook('on_cache_miss', {})
    emitEconomyHook('on_budget_warning', {})
    expect(hits).toEqual(['compress:pre', 'compress:post', 'cache:hit', 'cache:miss', 'budget:warning'])
  })

  it('does NOT dispatch when AGF_HOOKS=0 (kill-switch)', () => {
    let called = 0
    getSharedHookBus().on('cache:hit', async () => {
      called++
    })
    process.env.AGF_HOOKS = '0'
    emitEconomyHook('on_cache_hit', { key: 'x' })
    expect(called).toBe(0)
  })

  it('never throws to the caller when a handler throws', () => {
    getSharedHookBus().on('budget:warning', async () => {
      throw new Error('boom')
    })
    expect(() => emitEconomyHook('on_budget_warning', { ratio: 0.9 })).not.toThrow()
  })

  it('is a no-op when no handler is registered', () => {
    expect(() => emitEconomyHook('on_cache_miss', { key: 'x' })).not.toThrow()
  })
})
