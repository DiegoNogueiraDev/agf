/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getSharedHookBus, _resetSharedHookBus } from '../core/hooks/shared-hook-bus.js'
import { emitLlmHook } from '../core/hooks/llm-lifecycle-hooks.js'
import type { HookEvent } from '../core/hooks/hook-types.js'

describe('emitLlmHook — Task 2.1 LLM-phase dispatch', () => {
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

  it('dispatches the registered handler with a typed payload on the resolved channel', () => {
    const seen: HookEvent[] = []
    getSharedHookBus().on('llm:pre-call', async (e) => {
      seen.push(e)
    })
    emitLlmHook('pre_llm_call', { provider: 'openai', model: 'gpt-x' })
    expect(seen).toHaveLength(1)
    expect(seen[0].channel).toBe('llm:pre-call')
    expect(seen[0].payload).toMatchObject({ provider: 'openai', model: 'gpt-x' })
    expect(typeof seen[0].timestamp).toBe('string')
  })

  it('resolves each LLM point to its channel', () => {
    const hits: string[] = []
    for (const ch of ['llm:pre-call', 'llm:post-call', 'llm:error', 'llm:retry'] as const) {
      getSharedHookBus().on(ch, async () => {
        hits.push(ch)
      })
    }
    emitLlmHook('pre_llm_call', {})
    emitLlmHook('post_llm_call', {})
    emitLlmHook('on_llm_error', {})
    emitLlmHook('on_llm_retry', {})
    expect(hits).toEqual(['llm:pre-call', 'llm:post-call', 'llm:error', 'llm:retry'])
  })

  it('does NOT dispatch when AGF_HOOKS=0 (kill-switch)', () => {
    let called = 0
    getSharedHookBus().on('llm:pre-call', async () => {
      called++
    })
    process.env.AGF_HOOKS = '0'
    emitLlmHook('pre_llm_call', { provider: 'x' })
    expect(called).toBe(0)
  })

  it('never throws to the caller when a handler throws (byte-identical safety)', () => {
    getSharedHookBus().on('llm:error', async () => {
      throw new Error('handler boom')
    })
    expect(() => emitLlmHook('on_llm_error', { err: 'x' })).not.toThrow()
  })

  it('is a no-op when no handler is registered', () => {
    expect(() => emitLlmHook('post_llm_call', { tokens: 10 })).not.toThrow()
  })
})
