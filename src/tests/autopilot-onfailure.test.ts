/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { runAutopilot, type AutopilotGraphPort } from '../core/autonomy/autopilot-loop.js'

function onePort(dodReady = true): AutopilotGraphPort {
  const statuses = new Map<string, string>([['t1', 'backlog']])
  return {
    nextTask() {
      return statuses.get('t1') === 'backlog' ? { id: 't1', title: 'A' } : null
    },
    markInProgress(id) {
      statuses.set(id, 'in_progress')
    },
    checkDone(id) {
      const ready = dodReady && statuses.get(id) === 'in_progress'
      return { ready, failedRequired: ready ? [] : ['status_flow_valid'] }
    },
    markDone(id) {
      statuses.set(id, 'done')
    },
  }
}

describe('autopilot onFailure self-healing hook (T3.2)', () => {
  // AC: GIVEN a recoverable failure WHEN autopilot runs THEN a fix is attempted before escalation
  it('attempts a fix once and completes when the retry succeeds', async () => {
    const implement = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const onFailure = vi.fn().mockReturnValue({ retry: true, reason: 'scroll_into_view' })
    const res = await runAutopilot(onePort(), { maxIterations: 10, implement, onFailure })
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(implement).toHaveBeenCalledTimes(2) // first + one retry
    expect(res.completed).toBe(1)
    expect(res.escalated).toBe(0)
  })

  // AC: GIVEN an unrecoverable failure WHEN autopilot runs THEN it escalates (no infinite retry)
  it('escalates immediately when onFailure declines to retry', async () => {
    const implement = vi.fn().mockResolvedValue(false)
    const onFailure = vi.fn().mockReturnValue({ retry: false, reason: 'auth_error' })
    const res = await runAutopilot(onePort(), { maxIterations: 10, implement, onFailure })
    expect(implement).toHaveBeenCalledTimes(1) // no retry attempted
    expect(res.escalated).toBe(1)
    expect(res.stopped).toBe('escalation')
  })

  // AC: GIVEN a fix attempted WHEN it fails again THEN escalate instead of re-retrying
  it('retries exactly once then escalates when the fix also fails', async () => {
    const implement = vi.fn().mockResolvedValue(false)
    const onFailure = vi.fn().mockReturnValue({ retry: true, reason: 'recipe' })
    const res = await runAutopilot(onePort(), { maxIterations: 10, implement, onFailure })
    expect(onFailure).toHaveBeenCalledTimes(1) // not called again on the retry's failure
    expect(implement).toHaveBeenCalledTimes(2) // first + exactly one retry
    expect(res.escalated).toBe(1)
  })

  // Backward compatibility: no onFailure → identical pre-T3.2 behavior
  it('escalates on first failure when no onFailure is provided', async () => {
    const implement = vi.fn().mockResolvedValue(false)
    const res = await runAutopilot(onePort(), { maxIterations: 10, implement })
    expect(implement).toHaveBeenCalledTimes(1)
    expect(res.escalated).toBe(1)
    expect(res.stopped).toBe('escalation')
  })
})
