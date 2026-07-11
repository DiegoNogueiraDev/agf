/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getSharedHookBus, _resetSharedHookBus } from '../core/hooks/shared-hook-bus.js'
import { emitCircuitBreakHook } from '../core/hooks/finalization-lifecycle-hooks.js'
import type { HookEvent } from '../core/hooks/hook-types.js'

describe('emitCircuitBreakHook — Task 2.4 finalization dispatch (circuit:break)', () => {
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

  it('dispatches on circuit:break with a typed payload', () => {
    const seen: HookEvent[] = []
    getSharedHookBus().on('circuit:break', async (e) => {
      seen.push(e)
    })
    emitCircuitBreakHook({ scope: 'compaction', failures: 3 })
    expect(seen).toHaveLength(1)
    expect(seen[0].channel).toBe('circuit:break')
    expect(seen[0].payload).toMatchObject({ scope: 'compaction', failures: 3 })
  })

  it('does NOT dispatch when AGF_HOOKS=0 (kill-switch)', () => {
    let called = 0
    getSharedHookBus().on('circuit:break', async () => {
      called++
    })
    process.env.AGF_HOOKS = '0'
    emitCircuitBreakHook({ scope: 'x' })
    expect(called).toBe(0)
  })

  it('never throws to the caller when a handler throws', () => {
    getSharedHookBus().on('circuit:break', async () => {
      throw new Error('boom')
    })
    expect(() => emitCircuitBreakHook({ scope: 'x' })).not.toThrow()
  })

  it('is a no-op when no handler is registered', () => {
    expect(() => emitCircuitBreakHook({ scope: 'x' })).not.toThrow()
  })
})
