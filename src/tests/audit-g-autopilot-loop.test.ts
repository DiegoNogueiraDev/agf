/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Bug-audit regression — AUDIT-054 (HIGH).
 * src/core/autonomy/autopilot-loop.ts — a throw inside implement/gate/onFailure/
 * checkDone must not escape the loop (leaving the task stuck in_progress, WIP leaked);
 * it must convert to a clean `escalated` step + `escalation` stop.
 */
import { describe, it, expect } from 'vitest'
import { runAutopilot, type AutopilotGraphPort } from '../core/autonomy/autopilot-loop.js'

function makeFakePort(
  tasks: Array<{ id: string; title: string }>,
): AutopilotGraphPort & { statuses: Map<string, string> } {
  const statuses = new Map<string, string>(tasks.map((t) => [t.id, 'backlog']))
  return {
    statuses,
    nextTask() {
      const t = tasks.find((x) => statuses.get(x.id) === 'backlog')
      return t ? { id: t.id, title: t.title } : null
    },
    markInProgress(id) {
      statuses.set(id, 'in_progress')
    },
    checkDone() {
      return { ready: true, failedRequired: [] }
    },
    markDone(id) {
      statuses.set(id, 'done')
    },
  }
}

describe('AUDIT-054 — autopilot hooks never crash the loop', () => {
  it('implement throwing → escalates instead of propagating', async () => {
    const port = makeFakePort([{ id: 't1', title: 'A' }])
    const result = await runAutopilot(port, {
      maxIterations: 5,
      implement: () => {
        throw new Error('boom: provider exploded')
      },
    })
    expect(result.stopped).toBe('escalation')
    expect(result.escalated).toBe(1)
    expect(result.completed).toBe(0)
    expect(result.steps.at(-1)?.action).toBe('escalated')
  })

  it('beforeImplement throwing → escalates instead of propagating', async () => {
    const port = makeFakePort([{ id: 't1', title: 'A' }])
    const result = await runAutopilot(port, {
      maxIterations: 5,
      beforeImplement: () => {
        throw new Error('gate threw')
      },
    })
    expect(result.stopped).toBe('escalation')
    expect(result.escalated).toBe(1)
  })

  it('onFailure throwing → escalates instead of propagating', async () => {
    const port = makeFakePort([{ id: 't1', title: 'A' }])
    const result = await runAutopilot(port, {
      maxIterations: 5,
      implement: () => false, // first attempt fails → onFailure invoked
      onFailure: () => {
        throw new Error('heal recipe threw')
      },
    })
    expect(result.stopped).toBe('escalation')
    expect(result.escalated).toBe(1)
  })

  it('checkDone throwing → escalates instead of propagating', async () => {
    const port = makeFakePort([{ id: 't1', title: 'A' }])
    port.checkDone = () => {
      throw new Error('DoD blew up')
    }
    const result = await runAutopilot(port, { maxIterations: 5, implement: () => true })
    expect(result.stopped).toBe('escalation')
    expect(result.escalated).toBe(1)
  })

  it('regression: a clean run still completes', async () => {
    const port = makeFakePort([{ id: 't1', title: 'A' }])
    const result = await runAutopilot(port, { maxIterations: 5, implement: () => true })
    expect(result.stopped).toBe('no_more_tasks')
    expect(result.completed).toBe(1)
  })
})
