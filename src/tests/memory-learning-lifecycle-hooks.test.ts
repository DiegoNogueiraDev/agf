/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getSharedHookBus, _resetSharedHookBus } from '../core/hooks/shared-hook-bus.js'
import { emitMemoryLearningHook } from '../core/hooks/memory-learning-lifecycle-hooks.js'
import type { HookEvent } from '../core/hooks/hook-types.js'

describe('emitMemoryLearningHook — Task 2.5 memory/learning dispatch', () => {
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
    getSharedHookBus().on('learning:compile', async (e) => {
      seen.push(e)
    })
    emitMemoryLearningHook('on_learning_compile', { compiled: 3, skipped: 1 })
    expect(seen).toHaveLength(1)
    expect(seen[0].channel).toBe('learning:compile')
    expect(seen[0].payload).toMatchObject({ compiled: 3 })
  })

  it('resolves each memory/learning point to its channel', () => {
    const hits: string[] = []
    for (const ch of ['compact:pre', 'compact:post', 'learning:compile', 'learning:feedback'] as const) {
      getSharedHookBus().on(ch, async () => {
        hits.push(ch)
      })
    }
    emitMemoryLearningHook('pre_compact', {})
    emitMemoryLearningHook('post_compact', {})
    emitMemoryLearningHook('on_learning_compile', {})
    emitMemoryLearningHook('on_feedback', {})
    expect(hits).toEqual(['compact:pre', 'compact:post', 'learning:compile', 'learning:feedback'])
  })

  it('does NOT dispatch when AGF_HOOKS=0 (kill-switch)', () => {
    let called = 0
    getSharedHookBus().on('compact:pre', async () => {
      called++
    })
    process.env.AGF_HOOKS = '0'
    emitMemoryLearningHook('pre_compact', { tokens: 100 })
    expect(called).toBe(0)
  })

  it('never throws to the caller when a handler throws', () => {
    getSharedHookBus().on('learning:feedback', async () => {
      throw new Error('boom')
    })
    expect(() => emitMemoryLearningHook('on_feedback', { nodeId: 'x' })).not.toThrow()
  })

  it('is a no-op when no handler is registered', () => {
    expect(() => emitMemoryLearningHook('post_compact', {})).not.toThrow()
  })
})
