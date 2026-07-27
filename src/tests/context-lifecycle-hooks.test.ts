/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getSharedHookBus, _resetSharedHookBus } from '../core/hooks/shared-hook-bus.js'
import { emitContextHook } from '../core/hooks/context-lifecycle-hooks.js'
import type { HookEvent } from '../core/hooks/hook-types.js'

describe('emitContextHook — Task 2.2 context-phase dispatch', () => {
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
    getSharedHookBus().on('context:post-build', async (e) => {
      seen.push(e)
    })
    emitContextHook('post_context_build', { nodeId: 'node_x', tokens: 42 })
    expect(seen).toHaveLength(1)
    expect(seen[0].channel).toBe('context:post-build')
    expect(seen[0].payload).toMatchObject({ nodeId: 'node_x', tokens: 42 })
  })

  it('resolves each context point to its channel', () => {
    const hits: string[] = []
    for (const ch of ['context:pre-build', 'context:post-build', 'context:changed'] as const) {
      getSharedHookBus().on(ch, async () => {
        hits.push(ch)
      })
    }
    emitContextHook('pre_context_build', {})
    emitContextHook('post_context_build', {})
    emitContextHook('on_context_change', {})
    expect(hits).toEqual(['context:pre-build', 'context:post-build', 'context:changed'])
  })

  it('does NOT dispatch when AGF_HOOKS=0 (kill-switch)', () => {
    let called = 0
    getSharedHookBus().on('context:pre-build', async () => {
      called++
    })
    process.env.AGF_HOOKS = '0'
    emitContextHook('pre_context_build', { nodeId: 'x' })
    expect(called).toBe(0)
  })

  it('never throws to the caller when a handler throws', () => {
    getSharedHookBus().on('context:changed', async () => {
      throw new Error('boom')
    })
    expect(() => emitContextHook('on_context_change', { epoch: 1 })).not.toThrow()
  })

  it('is a no-op when no handler is registered', () => {
    expect(() => emitContextHook('post_context_build', {})).not.toThrow()
  })
})
