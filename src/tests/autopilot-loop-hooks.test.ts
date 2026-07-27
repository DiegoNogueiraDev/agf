/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_9a3698c1e237 — opt-in loop hooks (beforeImplement / onSuccess). Absent
 * hook ⇒ byte-identical to the legacy loop; present hook ⇒ gates/telemetry.
 */
import { describe, it, expect, vi } from 'vitest'
import { runAutopilot, type AutopilotGraphPort } from '../core/autonomy/autopilot-loop.js'

function makeFakePort(tasks: Array<{ id: string; title: string; dodReady: boolean }>): AutopilotGraphPort {
  const statuses = new Map<string, string>(tasks.map((t) => [t.id, 'backlog']))
  return {
    nextTask() {
      const t = tasks.find((x) => statuses.get(x.id) === 'backlog')
      return t ? { id: t.id, title: t.title } : null
    },
    markInProgress(id) {
      statuses.set(id, 'in_progress')
    },
    checkDone(id) {
      const t = tasks.find((x) => x.id === id)
      const ready = t?.dodReady === true && statuses.get(id) === 'in_progress'
      return { ready, failedRequired: ready ? [] : ['status_flow_valid'] }
    },
    markDone(id) {
      statuses.set(id, 'done')
    },
  }
}

describe('autopilot loop opt-in hooks (#node_9a3698c1e237)', () => {
  it('beforeImplement{block:true} escalates+stops and never calls implement', async () => {
    const port = makeFakePort([{ id: 't1', title: 'A', dodReady: true }])
    const implement = vi.fn(() => true)
    const result = await runAutopilot(port, {
      maxIterations: 5,
      implement,
      beforeImplement: () => ({ block: true, reason: 'required gap: AC#3 has no tests' }),
    })
    expect(result.stopped).toBe('escalation')
    expect(result.escalated).toBe(1)
    expect(result.completed).toBe(0)
    expect(implement).not.toHaveBeenCalled()
    expect(result.steps.at(-1)?.detail).toContain('required gap')
  })

  it('beforeImplement{block:false} lets the task through', async () => {
    const port = makeFakePort([{ id: 't1', title: 'A', dodReady: true }])
    const result = await runAutopilot(port, {
      maxIterations: 5,
      implement: () => true,
      beforeImplement: () => ({ block: false }),
    })
    expect(result.completed).toBe(1)
    expect(result.stopped).toBe('no_more_tasks')
  })

  it('onSuccess fires once per completed task', async () => {
    const port = makeFakePort([
      { id: 't1', title: 'A', dodReady: true },
      { id: 't2', title: 'B', dodReady: true },
    ])
    const onSuccess = vi.fn()
    const result = await runAutopilot(port, { maxIterations: 5, implement: () => true, onSuccess })
    expect(result.completed).toBe(2)
    expect(onSuccess).toHaveBeenCalledTimes(2)
    expect(onSuccess).toHaveBeenCalledWith({ id: 't1', title: 'A' })
  })

  it('onSuccess throwing never breaks the loop (telemetry is best-effort)', async () => {
    const port = makeFakePort([{ id: 't1', title: 'A', dodReady: true }])
    const result = await runAutopilot(port, {
      maxIterations: 5,
      implement: () => true,
      onSuccess: () => {
        throw new Error('learning store offline')
      },
    })
    expect(result.completed).toBe(1)
    expect(result.stopped).toBe('no_more_tasks')
  })

  it('absent hooks ⇒ byte-identical legacy behaviour (completes normally)', async () => {
    const port = makeFakePort([{ id: 't1', title: 'A', dodReady: true }])
    const result = await runAutopilot(port, { maxIterations: 5, implement: () => true })
    expect(result.completed).toBe(1)
    expect(result.escalated).toBe(0)
  })
})
