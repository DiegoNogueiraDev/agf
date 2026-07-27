/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getSharedHookBus, _resetSharedHookBus } from '../core/hooks/shared-hook-bus.js'
import { emitTransversalHook } from '../core/hooks/transversal-lifecycle-hooks.js'
import type { HookEvent } from '../core/hooks/hook-types.js'

describe('emitTransversalHook — Task 2.6 cross-cutting dispatch', () => {
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
    getSharedHookBus().on('status:pre-change', async (e) => {
      seen.push(e)
    })
    emitTransversalHook('pre_node_status_change', { nodeId: 'n1', from: 'backlog', to: 'in_progress' })
    expect(seen).toHaveLength(1)
    expect(seen[0].channel).toBe('status:pre-change')
    expect(seen[0].payload).toMatchObject({ nodeId: 'n1', from: 'backlog', to: 'in_progress' })
  })

  it('resolves each transversal point to its channel', () => {
    const hits: string[] = []
    for (const ch of ['status:pre-change', 'gate:check', 'task:dependency-resolved'] as const) {
      getSharedHookBus().on(ch, async () => {
        hits.push(ch)
      })
    }
    emitTransversalHook('pre_node_status_change', {})
    emitTransversalHook('on_gate_check', {})
    emitTransversalHook('on_dependency_resolved', {})
    expect(hits).toEqual(['status:pre-change', 'gate:check', 'task:dependency-resolved'])
  })

  it('does NOT dispatch when AGF_HOOKS=0 (kill-switch)', () => {
    let called = 0
    getSharedHookBus().on('gate:check', async () => {
      called++
    })
    process.env.AGF_HOOKS = '0'
    emitTransversalHook('on_gate_check', { phase: 'design' })
    expect(called).toBe(0)
  })

  it('never throws to the caller when a handler throws', () => {
    getSharedHookBus().on('task:dependency-resolved', async () => {
      throw new Error('boom')
    })
    expect(() => emitTransversalHook('on_dependency_resolved', { nodeId: 'x' })).not.toThrow()
  })

  it('is a no-op when no handler is registered', () => {
    expect(() => emitTransversalHook('on_gate_check', {})).not.toThrow()
  })
})
