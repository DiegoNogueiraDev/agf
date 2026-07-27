/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Task 4.4: Enrich autopilot escalation with last-error and token-usage context.
 * AC1 — escalated step detail includes attempt count and non-empty lastError.
 * AC2 — escalated step includes tokensUsed field in escalationContext.
 * AC3 — escalationContext contains { attempt, lastError, tokensUsed }.
 */

import { describe, it, expect, vi } from 'vitest'
import { runAutopilot } from '../core/autonomy/autopilot-loop.js'
import type { AutopilotGraphPort } from '../core/autonomy/autopilot-loop.js'

function makePort(overrides: Partial<AutopilotGraphPort> = {}): AutopilotGraphPort {
  return {
    nextTask: vi.fn().mockReturnValue({ id: 'n1', title: 'Test task' }),
    markInProgress: vi.fn(),
    checkDone: vi.fn().mockReturnValue({ ready: true, failedRequired: [] }),
    markDone: vi.fn(),
    ...overrides,
  }
}

// ── AC1 ───────────────────────────────────────────────────────────────────────

describe('autopilot escalation: attempt count and lastError in step detail', () => {
  it('escalated step detail contains attempt count when implement fails', async () => {
    const port = makePort()
    const result = await runAutopilot(port, {
      maxIterations: 5,
      implement: () => ({ success: false, error: 'Test suite failed: expected 1 got 2' }),
    })
    expect(result.stopped).toBe('escalation')
    const escalatedStep = result.steps.find((s) => s.action === 'escalated')
    expect(escalatedStep).toBeDefined()
    // escalationContext should carry attempt count
    expect(escalatedStep?.escalationContext?.attempt).toBeGreaterThanOrEqual(1)
  })

  it('escalated step escalationContext.lastError is non-empty excerpt', async () => {
    const port = makePort()
    const result = await runAutopilot(port, {
      maxIterations: 5,
      implement: () => ({ success: false, error: 'Test suite failed: expected 1 got 2, stack: at line 42' }),
    })
    expect(result.stopped).toBe('escalation')
    const escalatedStep = result.steps.find((s) => s.action === 'escalated')
    expect(escalatedStep?.escalationContext?.lastError).toBeDefined()
    expect(typeof escalatedStep?.escalationContext?.lastError).toBe('string')
    expect(escalatedStep?.escalationContext?.lastError?.length).toBeGreaterThan(0)
  })
})

// ── AC2 ───────────────────────────────────────────────────────────────────────

describe('autopilot escalation: tokensUsed in escalationContext', () => {
  it('escalated step escalationContext.tokensUsed is a non-negative number', async () => {
    const port = makePort()
    const result = await runAutopilot(port, {
      maxIterations: 5,
      implement: () => ({ success: false, error: 'failed', tokensUsed: 150 }),
    })
    expect(result.stopped).toBe('escalation')
    const escalatedStep = result.steps.find((s) => s.action === 'escalated')
    expect(typeof escalatedStep?.escalationContext?.tokensUsed).toBe('number')
    expect(escalatedStep?.escalationContext?.tokensUsed).toBeGreaterThanOrEqual(0)
  })

  it('escalationContext.tokensUsed accumulates across retry attempts', async () => {
    let call = 0
    const port = makePort()
    const result = await runAutopilot(port, {
      maxIterations: 5,
      implement: () => {
        call++
        return { success: false, error: `attempt ${call} failed`, tokensUsed: 100 }
      },
      onFailure: () => ({ retry: true }),
    })
    expect(result.stopped).toBe('escalation')
    const escalatedStep = result.steps.find((s) => s.action === 'escalated')
    // After 2 attempts (initial + 1 retry), cumulative tokensUsed should be >= 100
    expect(escalatedStep?.escalationContext?.tokensUsed).toBeGreaterThanOrEqual(100)
  })
})

// ── AC3 ───────────────────────────────────────────────────────────────────────

describe('autopilot escalation: escalationContext shape', () => {
  it('escalationContext has all three fields: attempt, lastError, tokensUsed', async () => {
    const port = makePort()
    const result = await runAutopilot(port, {
      maxIterations: 5,
      implement: () => ({ success: false, error: 'unit test: 3 failed, 0 passed', tokensUsed: 200 }),
    })
    const escalatedStep = result.steps.find((s) => s.action === 'escalated')
    expect(escalatedStep?.escalationContext).toBeDefined()
    const ctx = escalatedStep?.escalationContext
    expect(ctx).toMatchObject({
      attempt: expect.any(Number),
      lastError: expect.any(String),
      tokensUsed: expect.any(Number),
    })
  })

  it('escalationContext.lastError is capped at 200 chars', async () => {
    const longError = 'E'.repeat(500)
    const port = makePort()
    const result = await runAutopilot(port, {
      maxIterations: 5,
      implement: () => ({ success: false, error: longError }),
    })
    const escalatedStep = result.steps.find((s) => s.action === 'escalated')
    const lastError = escalatedStep?.escalationContext?.lastError ?? ''
    expect(lastError.length).toBeLessThanOrEqual(200)
  })
})
