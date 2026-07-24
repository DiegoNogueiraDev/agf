/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_a540ef426973 — the autopilot escalation masked the underlying provider
 * error: run-build threw a generic 'autopilot escalou' (classifyLlmError→unknown)
 * instead of the real 401/auth reason the implement attempt already carried in
 * escalationContext.lastError. escalationReason() extracts that reason so the
 * surface can classify it (auth), not report a bland 'unknown'.
 */

import { describe, it, expect } from 'vitest'
import { escalationReason, type AutopilotResult } from '../core/autonomy/autopilot-loop.js'
import { classifyLlmError } from '../core/model-hub/llm-error.js'

function result(over: Partial<AutopilotResult> = {}): AutopilotResult {
  return { steps: [], completed: 0, escalated: 0, stopped: 'escalation', ...over }
}

describe('escalationReason — surfaces the underlying provider reason from an escalation', () => {
  it('returns the last escalated step lastError (a 401 auth message)', () => {
    const r = result({
      escalated: 1,
      steps: [
        {
          nodeId: 'n1',
          title: 't',
          action: 'escalated',
          detail: 'x',
          escalationContext: {
            attempt: 1,
            lastError: 'Model adapter error: provider openrouter retornou 401: User not found',
            tokensUsed: 0,
          },
        },
      ],
    })
    const reason = escalationReason(r)
    expect(reason).toContain('401')
    // The whole point: run-build wraps this reason in the thrown Error, and
    // scenario-runner classifies that Error → auth, not the bland 'unknown'.
    expect(classifyLlmError(new Error(`autopilot escalou: ${reason}`)).kind).toBe('auth')
  })

  it('returns undefined when there is no escalated step', () => {
    expect(
      escalationReason(result({ stopped: 'done', steps: [{ nodeId: 'n', title: 't', action: 'done', detail: 'ok' }] })),
    ).toBeUndefined()
  })

  it('returns undefined when the escalated step carries no lastError', () => {
    const r = result({
      steps: [
        {
          nodeId: 'n',
          title: 't',
          action: 'escalated',
          detail: 'x',
          escalationContext: { attempt: 1, lastError: '', tokensUsed: 0 },
        },
      ],
    })
    expect(escalationReason(r)).toBeUndefined()
  })

  it('picks the LAST escalated step when several exist', () => {
    const r = result({
      steps: [
        {
          nodeId: 'a',
          title: 't',
          action: 'escalated',
          detail: 'x',
          escalationContext: { attempt: 1, lastError: 'first', tokensUsed: 0 },
        },
        {
          nodeId: 'b',
          title: 't',
          action: 'escalated',
          detail: 'x',
          escalationContext: { attempt: 1, lastError: 'provider retornou 429: rate', tokensUsed: 0 },
        },
      ],
    })
    expect(escalationReason(r)).toContain('429')
  })
})
