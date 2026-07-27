/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import { runAutopilot } from '../../core/autonomy/autopilot-loop.js'
import type { AutopilotGraphPort } from '../../core/autonomy/autopilot-loop.js'

function makePort(overrides: Partial<AutopilotGraphPort> = {}): AutopilotGraphPort {
  return {
    nextTask: vi.fn().mockReturnValue(null),
    markInProgress: vi.fn(),
    checkDone: vi.fn().mockReturnValue({ ready: true, failedRequired: [] }),
    markDone: vi.fn(),
    ...overrides,
  }
}

function makeTask(id: string, title = `Task ${id}`) {
  return { id, title }
}

describe('runAutopilot', () => {
  // AC1: maxIterations budget guard
  describe('budget_exhausted (AC1)', () => {
    it('stops after maxIterations tasks without throwing', async () => {
      let seq = 0
      const port = makePort({
        nextTask: vi.fn(() => (seq < 10 ? makeTask(`node_${seq++}`) : null)),
      })

      const result = await runAutopilot(port, { maxIterations: 3 })

      expect(result.stopped).toBe('budget_exhausted')
      expect(result.completed).toBe(3)
      expect(result.escalated).toBe(0)
    })

    it('records one step per completed task', async () => {
      let seq = 0
      const port = makePort({
        nextTask: vi.fn(() => (seq < 10 ? makeTask(`node_${seq++}`) : null)),
      })

      const result = await runAutopilot(port, { maxIterations: 2 })

      const doneSteps = result.steps.filter((s) => s.action === 'done')
      expect(doneSteps).toHaveLength(2)
    })
  })

  // AC2: WIP=1 enforcement via port signal
  describe('all_blocked (AC2 — WIP=1)', () => {
    it('stops with all_blocked when port returns all_tasks_blocked', async () => {
      const port = makePort({
        nextTask: vi.fn().mockReturnValue({ warning: 'all_tasks_blocked' }),
      })

      const result = await runAutopilot(port, { maxIterations: 5 })

      expect(result.stopped).toBe('all_blocked')
      expect(port.markInProgress).not.toHaveBeenCalled()
      expect(result.completed).toBe(0)
    })

    it('does not start a new task when port signals WIP=1 saturation', async () => {
      // first call returns a task, second signals all blocked (in_progress exists)
      let call = 0
      const port = makePort({
        nextTask: vi.fn(() => {
          if (call++ === 0) return makeTask('node_first')
          return { warning: 'all_tasks_blocked' as const }
        }),
      })

      const result = await runAutopilot(port, { maxIterations: 5 })

      expect(result.stopped).toBe('all_blocked')
      expect(result.completed).toBe(1) // first completed before WIP limit
      expect(port.markInProgress).toHaveBeenCalledTimes(1)
    })
  })

  // AC3: exactly 1 retry before escalation
  describe('retry-once then escalate (AC3)', () => {
    it('retries exactly once when onFailure returns retry:true, then escalates', async () => {
      const port = makePort({
        nextTask: vi.fn().mockReturnValue(makeTask('node_fail')),
      })
      const implement = vi.fn().mockResolvedValue(false) // always fails
      const onFailure = vi.fn().mockResolvedValue({ retry: true, reason: 'fix applied' })

      const result = await runAutopilot(port, {
        maxIterations: 5,
        implement,
        onFailure,
      })

      expect(result.stopped).toBe('escalation')
      expect(implement).toHaveBeenCalledTimes(2) // initial + 1 retry
      expect(onFailure).toHaveBeenCalledTimes(1)
      expect(onFailure).toHaveBeenCalledWith({
        node: { id: 'node_fail', title: 'Task node_fail' },
        attempt: 1,
      })
      expect(result.escalated).toBe(1)
    })

    it('escalates immediately without retry when onFailure returns retry:false', async () => {
      const port = makePort({
        nextTask: vi.fn().mockReturnValue(makeTask('node_fail')),
      })
      const implement = vi.fn().mockResolvedValue(false)
      const onFailure = vi.fn().mockResolvedValue({ retry: false })

      const result = await runAutopilot(port, {
        maxIterations: 5,
        implement,
        onFailure,
      })

      expect(result.stopped).toBe('escalation')
      expect(implement).toHaveBeenCalledTimes(1) // no retry
      expect(result.escalated).toBe(1)
    })

    it('escalates on first failure when onFailure is absent', async () => {
      const port = makePort({
        nextTask: vi.fn().mockReturnValue(makeTask('node_fail')),
      })
      const implement = vi.fn().mockResolvedValue(false)

      const result = await runAutopilot(port, {
        maxIterations: 5,
        implement,
      })

      expect(result.stopped).toBe('escalation')
      expect(implement).toHaveBeenCalledTimes(1)
    })
  })

  // AC4: AbortSignal cooperative stop
  describe('aborted signal (AC4)', () => {
    it('stops immediately with aborted when signal is already aborted before loop starts', async () => {
      const port = makePort({
        nextTask: vi.fn().mockReturnValue(makeTask('node_1')),
      })
      const signal = { aborted: true }

      const result = await runAutopilot(port, { maxIterations: 5, signal })

      expect(result.stopped).toBe('aborted')
      expect(port.nextTask).not.toHaveBeenCalled()
      expect(result.completed).toBe(0)
    })

    it('stops between iterations when signal becomes aborted mid-run', async () => {
      let seq = 0
      const port = makePort({
        nextTask: vi.fn(() => makeTask(`node_${seq++}`)),
      })
      // signal becomes aborted after 2 tasks complete via onSuccess callback
      const signal = { aborted: false }
      const onSuccess = vi.fn().mockImplementation(async () => {
        if (seq >= 2) signal.aborted = true
      })

      const result = await runAutopilot(port, { maxIterations: 10, signal, onSuccess })

      expect(result.stopped).toBe('aborted')
      expect(result.completed).toBe(2)
    })
  })

  // Happy-path and edge cases
  describe('happy path', () => {
    it('completes all tasks and stops with no_more_tasks', async () => {
      let seq = 0
      const tasks = [makeTask('node_a'), makeTask('node_b')]
      const port = makePort({
        nextTask: vi.fn(() => tasks[seq++] ?? null),
      })

      const result = await runAutopilot(port, { maxIterations: 10 })

      expect(result.stopped).toBe('no_more_tasks')
      expect(result.completed).toBe(2)
      expect(port.markDone).toHaveBeenCalledTimes(2)
    })

    it('escalates when DoD gate fails required check', async () => {
      const port = makePort({
        nextTask: vi.fn().mockReturnValue(makeTask('node_1')),
        checkDone: vi.fn().mockReturnValue({
          ready: false,
          failedRequired: ['has_acceptance_criteria'],
        }),
      })

      const result = await runAutopilot(port, { maxIterations: 5 })

      expect(result.stopped).toBe('escalation')
      expect(result.escalated).toBe(1)
      expect(port.markDone).not.toHaveBeenCalled()
    })

    it('escalates when beforeImplement gate blocks a task', async () => {
      const port = makePort({
        nextTask: vi.fn().mockReturnValue(makeTask('node_1')),
      })
      const beforeImplement = vi.fn().mockResolvedValue({ block: true, reason: 'gaps detected' })

      const result = await runAutopilot(port, { maxIterations: 5, beforeImplement })

      expect(result.stopped).toBe('escalation')
      expect(result.escalated).toBe(1)
    })

    it('calls onStep for every action recorded', async () => {
      let seq = 0
      const port = makePort({
        nextTask: vi.fn(() => (seq < 2 ? makeTask(`node_${seq++}`) : null)),
      })
      const onStep = vi.fn()

      await runAutopilot(port, { maxIterations: 10, onStep })

      // 2 tasks × 2 steps each (in_progress + done) = 4 steps
      expect(onStep).toHaveBeenCalledTimes(4)
    })

    it('does not break loop when onSuccess throws', async () => {
      let seq = 0
      const port = makePort({
        nextTask: vi.fn(() => (seq < 2 ? makeTask(`node_${seq++}`) : null)),
      })
      const onSuccess = vi.fn().mockRejectedValue(new Error('telemetry failure'))

      const result = await runAutopilot(port, { maxIterations: 10, onSuccess })

      expect(result.stopped).toBe('no_more_tasks')
      expect(result.completed).toBe(2)
    })
  })
})
