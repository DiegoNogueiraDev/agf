/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC Unified Hook Surface (Task 3.4) — suíte de não-regressão consolidada.
 * Prova as duas invariantes de todas as 9 tasks de wiring: (1) kill-switch
 * AGF_HOOKS=0 suprime TODOS os emissores; (2) emitir sem handler é no-op e
 * barato (<10ms), garantindo byte-identical no hot path.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getSharedHookBus, _resetSharedHookBus } from '../core/hooks/shared-hook-bus.js'
import { _resetRegisteredHooks } from '../core/hooks/register-hook.js'
import { emitLlmHook } from '../core/hooks/llm-lifecycle-hooks.js'
import { emitContextHook } from '../core/hooks/context-lifecycle-hooks.js'
import { emitEconomyHook } from '../core/hooks/economy-lifecycle-hooks.js'
import { emitCircuitBreakHook } from '../core/hooks/finalization-lifecycle-hooks.js'
import { emitMemoryLearningHook } from '../core/hooks/memory-learning-lifecycle-hooks.js'
import { emitTransversalHook } from '../core/hooks/transversal-lifecycle-hooks.js'
import { HOOK_TAXONOMY_POINTS, resolveHookChannel, HOOK_CHANNELS } from '../core/hooks/hook-types.js'

/** Dispara um exemplo de cada um dos 6 emissores de fase. */
function fireAllEmitters(): void {
  emitLlmHook('pre_llm_call', { provider: 'x' })
  emitContextHook('pre_context_build', { nodeId: 'x' })
  emitEconomyHook('on_cache_hit', { hash: 'x' })
  emitCircuitBreakHook({ scope: 'x' })
  emitMemoryLearningHook('on_feedback', { nodeId: 'x' })
  emitTransversalHook('on_gate_check', { phase: 'design' })
}

describe('Unified Hook Surface — non-regression suite', () => {
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

  it('AGF_HOOKS=0 suppresses every phase emitter (kill-switch)', () => {
    let fired = 0
    for (const ch of [
      'llm:pre-call',
      'context:pre-build',
      'cache:hit',
      'circuit:break',
      'learning:feedback',
      'gate:check',
    ] as const) {
      getSharedHookBus().on(ch, async () => {
        fired++
      })
    }
    process.env.AGF_HOOKS = '0'
    fireAllEmitters()
    expect(fired).toBe(0)
  })

  it('with no handler, every emitter is a no-op that never throws', () => {
    expect(() => fireAllEmitters()).not.toThrow()
  })

  it('zero-handler dispatch of all 28 channels stays well under budget (<10ms/emit avg)', () => {
    const t0 = performance.now()
    const ITER = 200
    for (let i = 0; i < ITER; i++) {
      for (const point of HOOK_TAXONOMY_POINTS) {
        const channel = resolveHookChannel(point)
        getSharedHookBus().emitSync({ channel, timestamp: '2026-01-01T00:00:00.000Z', payload: {} })
      }
    }
    const perEmit = (performance.now() - t0) / (ITER * HOOK_TAXONOMY_POINTS.length)
    expect(perEmit).toBeLessThan(10)
  })

  it('all 28 taxonomy points resolve to channels present in HOOK_CHANNELS', () => {
    for (const point of HOOK_TAXONOMY_POINTS) {
      expect(HOOK_CHANNELS).toContain(resolveHookChannel(point))
    }
  })
})
