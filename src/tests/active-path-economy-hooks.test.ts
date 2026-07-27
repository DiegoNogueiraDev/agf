/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * WS-C / T2.1 — os hooks de fase Economia disparam na VIA ATIVA.
 * Prova que o retry-loop real (attemptImplementation) emite pre_compress +
 * post_compress ao comprimir o feedback de teste — antes só o orquestrador
 * morto emitia. No-op sem handler; aqui registramos handlers no bus compartilhado.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { attemptImplementation, type AttemptDeps } from '../core/autonomy/implement-attempt.js'
import type { ImplementationPlan, ExecutionResult } from '../core/autonomy/implementation-executor.js'
import { getSharedHookBus, _resetSharedHookBus } from '../core/hooks/shared-hook-bus.js'

const node = { id: 'node_1', title: 'Soma' }

// Saída de teste grande e repetitiva (> MIN_COMPRESS_SIZE) → comprime de fato.
const BIG_FAIL = 'AssertionError: expected 2-3 to equal 5\n'.repeat(60)

function bigRedExecute(plan: ImplementationPlan): Promise<ExecutionResult> {
  const files = plan.files ?? []
  const red = files.some((f) => f.content.includes('BUG'))
  const applied = files.map((f) => f.path)
  return Promise.resolve(
    red
      ? { applied, testPassed: false, testOutput: BIG_FAIL, testExitCode: 1 }
      : { applied, testPassed: true, testOutput: '1 passed', testExitCode: 0 },
  )
}

function planJson(content: string): string {
  return JSON.stringify({ files: [{ path: 'sum.js', content }], testCommand: 'node t.js' })
}

describe('via ativa — hooks de economia disparam no retry-loop', () => {
  beforeEach(() => {
    _resetSharedHookBus()
    delete process.env.AGF_HOOKS
  })
  afterEach(() => _resetSharedHookBus())

  it('emite pre_compress e post_compress ao comprimir o feedback de teste', async () => {
    const channels: string[] = []
    getSharedHookBus().on('compress:pre', async () => {
      channels.push('compress:pre')
    })
    getSharedHookBus().on('compress:post', async () => {
      channels.push('compress:post')
    })

    const responses = [planJson('a - b // BUG'), planJson('a + b')]
    let i = 0
    const deps: AttemptDeps = {
      generate: async () => responses[i++],
      execute: bigRedExecute,
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 3 })
    expect(outcome.success).toBe(true)
    expect(channels).toContain('compress:pre')
    expect(channels).toContain('compress:post')
  })
})
