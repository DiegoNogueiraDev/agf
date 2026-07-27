/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_98f23be135b9 — Remediation loop in autopilot
 *
 * AC1: GIVEN test fails WHEN remediation loop THEN LLM receives error + code context, tries fix
 * AC2: GIVEN 3 failed attempts THEN escalates to stronger model (Haiku → Sonnet)
 * AC3: GIVEN remediation completes THEN ledger records: attempts, model_used, tokens_spent, success
 */

import { describe, it, expect, vi } from 'vitest'
import {
  runRemediationLoop,
  type RemediationContext,
  type RemediationResult,
  type RemediationLlmPort,
} from '../core/autopilot/remediation-loop.js'

const ESCALATION_THRESHOLD = 3

function makeCtx(overrides: Partial<RemediationContext> = {}): RemediationContext {
  return {
    nodeId: 'node_test',
    sourceFile: 'src/core/foo.ts',
    sourceCode: 'export function foo() { return 1 }',
    testFile: 'src/tests/foo.test.ts',
    testErrorOutput: 'AssertionError: expected 1 to be 2',
    baseModel: 'haiku',
    escalationModel: 'sonnet',
    maxAttempts: 5,
    ...overrides,
  }
}

// ── AC1 — LLM receives error + code context ───────────────────────────────────

describe('runRemediationLoop (AC1 — sends error + code context)', () => {
  it('calls LLM with testErrorOutput and sourceCode in prompt', async () => {
    const llm: RemediationLlmPort = {
      fix: vi.fn().mockResolvedValue({ fixedCode: 'export function foo() { return 2 }', tokensUsed: 100 }),
      runTest: vi.fn().mockResolvedValue({ passed: true, output: 'ok' }),
    }
    const ctx = makeCtx()
    await runRemediationLoop(ctx, llm)

    expect(llm.fix).toHaveBeenCalledWith(
      expect.objectContaining({
        errorOutput: ctx.testErrorOutput,
        sourceCode: ctx.sourceCode,
        model: 'haiku',
      }),
    )
  })

  it('does NOT regenerate from scratch — sends original source as base', async () => {
    const llm: RemediationLlmPort = {
      fix: vi.fn().mockResolvedValue({ fixedCode: 'patched', tokensUsed: 50 }),
      runTest: vi.fn().mockResolvedValue({ passed: true, output: 'ok' }),
    }
    const ctx = makeCtx({ sourceCode: 'original-source' })
    await runRemediationLoop(ctx, llm)
    const call = vi.mocked(llm.fix).mock.calls[0][0]
    expect(call.sourceCode).toBe('original-source')
  })
})

// ── AC2 — model escalation after 3 failed attempts ───────────────────────────

describe('runRemediationLoop (AC2 — escalation after 3 failures)', () => {
  it('uses escalation model after ESCALATION_THRESHOLD consecutive failures', async () => {
    let attempt = 0
    const llm: RemediationLlmPort = {
      fix: vi.fn().mockResolvedValue({ fixedCode: 'still-broken', tokensUsed: 50 }),
      runTest: vi.fn().mockImplementation(async () => {
        attempt++
        return { passed: attempt > ESCALATION_THRESHOLD, output: attempt > ESCALATION_THRESHOLD ? 'ok' : 'fail' }
      }),
    }
    const ctx = makeCtx({ maxAttempts: 6 })
    const result = await runRemediationLoop(ctx, llm)

    const calls = vi.mocked(llm.fix).mock.calls
    const lastCall = calls[calls.length - 1][0]
    expect(lastCall.model).toBe('sonnet')
    expect(result.success).toBe(true)
  })

  it('stays on base model for the first ESCALATION_THRESHOLD attempts', async () => {
    const llm: RemediationLlmPort = {
      fix: vi.fn().mockResolvedValue({ fixedCode: 'broken', tokensUsed: 50 }),
      runTest: vi.fn().mockResolvedValue({ passed: false, output: 'fail' }),
    }
    const ctx = makeCtx({ maxAttempts: 2 })
    await runRemediationLoop(ctx, llm)

    const calls = vi.mocked(llm.fix).mock.calls
    for (const call of calls) {
      expect(call[0].model).toBe('haiku')
    }
  })
})

// ── AC3 — ledger fields ───────────────────────────────────────────────────────

describe('runRemediationLoop (AC3 — ledger records)', () => {
  it('returns attempts, model_used, tokens_spent, success on first-pass success', async () => {
    const llm: RemediationLlmPort = {
      fix: vi.fn().mockResolvedValue({ fixedCode: 'fixed', tokensUsed: 200 }),
      runTest: vi.fn().mockResolvedValue({ passed: true, output: 'ok' }),
    }
    const result: RemediationResult = await runRemediationLoop(makeCtx(), llm)
    expect(result.attempts).toBe(1)
    expect(result.modelUsed).toBe('haiku')
    expect(result.tokensSpent).toBe(200)
    expect(result.success).toBe(true)
  })

  it('records success:false when all attempts exhausted', async () => {
    const llm: RemediationLlmPort = {
      fix: vi.fn().mockResolvedValue({ fixedCode: 'still-broken', tokensUsed: 50 }),
      runTest: vi.fn().mockResolvedValue({ passed: false, output: 'fail' }),
    }
    const result = await runRemediationLoop(makeCtx({ maxAttempts: 2 }), llm)
    expect(result.success).toBe(false)
    expect(result.attempts).toBe(2)
    expect(result.tokensSpent).toBeGreaterThan(0)
  })
})
