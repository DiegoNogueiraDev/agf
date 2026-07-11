/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_125ca6831acf AC coverage: colony health circuit breaker in autopilot
 *
 * AC: agf autopilot verifica colony-health a cada 10 ciclos
 * AC: grade=F → para e emite COLONY CRITICAL (stopped='colony_critical')
 * AC: grade=D → próximo ciclo vai para graph-quality (stopped='colony_degraded')
 * AC: trend=critical (3+ declínios) → idem grade D
 */

import { describe, it, expect } from 'vitest'
import { runAutopilot, type AutopilotGraphPort } from '../core/autonomy/autopilot-loop.js'
import type { HealthGrade } from '../core/colony/colony-signals.js'

function makePort(count: number, dodReady = true): AutopilotGraphPort {
  let taskNum = 0
  const statuses = new Map<string, string>()
  return {
    nextTask() {
      if (taskNum >= count) return null
      const id = `t${taskNum}`
      if (!statuses.has(id)) statuses.set(id, 'backlog')
      const t = { id, title: `Task ${taskNum}` }
      return statuses.get(id) === 'backlog' ? t : null
    },
    markInProgress(id) {
      statuses.set(id, 'in_progress')
      taskNum++
    },
    checkDone(id) {
      return { ready: dodReady, failedRequired: dodReady ? [] : ['has_acceptance_criteria'] }
    },
    markDone(id) {
      statuses.set(id, 'done')
    },
  }
}

// ── grade=F circuit breaker ───────────────────────────────────────────────────

describe('colony health circuit breaker — grade F', () => {
  it('stops with colony_critical when health check returns grade F at cycle 10', async () => {
    const port = makePort(50)
    let checkCount = 0
    const result = await runAutopilot(port, {
      maxIterations: 50,
      colonyHealthCheck: () => {
        checkCount++
        return { grade: 'F' as HealthGrade }
      },
      colonyHealthInterval: 10,
    })
    expect(result.stopped).toBe('colony_critical')
  })

  it('does not stop before 10 cycles even with grade F if check not triggered yet', async () => {
    const port = makePort(50)
    let calls = 0
    const result = await runAutopilot(port, {
      maxIterations: 5,
      colonyHealthCheck: () => {
        calls++
        return { grade: 'F' as HealthGrade }
      },
      colonyHealthInterval: 10,
    })
    // Only 5 iterations, interval=10 → check not triggered → stop via budget or no_more_tasks
    expect(result.stopped).not.toBe('colony_critical')
    expect(calls).toBe(0)
  })

  it('emits COLONY CRITICAL step when stopping on grade F', async () => {
    const port = makePort(50)
    const result = await runAutopilot(port, {
      maxIterations: 50,
      colonyHealthCheck: () => ({ grade: 'F' as HealthGrade }),
      colonyHealthInterval: 10,
    })
    const criticalStep = result.steps.find((s) => s.detail.includes('COLONY CRITICAL'))
    expect(criticalStep).toBeDefined()
  })
})

// ── grade=D circuit breaker ───────────────────────────────────────────────────

describe('colony health circuit breaker — grade D', () => {
  it('stops with colony_degraded when health check returns grade D', async () => {
    const port = makePort(50)
    const result = await runAutopilot(port, {
      maxIterations: 50,
      colonyHealthCheck: () => ({ grade: 'D' as HealthGrade }),
      colonyHealthInterval: 10,
    })
    expect(result.stopped).toBe('colony_degraded')
  })

  it('emits colony_degraded step detail with graph-quality suggestion', async () => {
    const port = makePort(50)
    const result = await runAutopilot(port, {
      maxIterations: 50,
      colonyHealthCheck: () => ({ grade: 'D' as HealthGrade }),
      colonyHealthInterval: 10,
    })
    const step = result.steps.find((s) => s.detail.includes('graph-quality'))
    expect(step).toBeDefined()
  })
})

// ── trend=critical (3+ consecutive declines) ─────────────────────────────────

describe('colony health circuit breaker — trend critical', () => {
  it('stops with colony_degraded after 3 consecutive grade declines', async () => {
    const port = makePort(100)
    const grades: HealthGrade[] = ['B', 'C', 'D', 'F']
    let idx = 0
    const result = await runAutopilot(port, {
      maxIterations: 100,
      colonyHealthCheck: () => ({ grade: grades[Math.min(idx++, grades.length - 1)] }),
      colonyHealthInterval: 5,
    })
    // After 3 consecutive declines (B→C→D), should stop as colony_degraded
    expect(['colony_degraded', 'colony_critical']).toContain(result.stopped)
  })

  it('does not stop on isolated single grade change (not a trend)', async () => {
    const port = makePort(5)
    const grades: HealthGrade[] = ['A', 'B']
    let idx = 0
    const result = await runAutopilot(port, {
      maxIterations: 5,
      colonyHealthCheck: () => ({ grade: grades[Math.min(idx++, grades.length - 1)] }),
      colonyHealthInterval: 1,
    })
    // Only 1 decline (A→B), not a trend — loop completes normally
    expect(result.stopped).not.toBe('colony_degraded')
  })
})

// ── no-op when colonyHealthCheck is absent ────────────────────────────────────

describe('backward compatibility — no colonyHealthCheck', () => {
  it('completes normally when no colonyHealthCheck is provided', async () => {
    const port = makePort(3)
    const result = await runAutopilot(port, { maxIterations: 10 })
    expect(result.stopped).toBe('no_more_tasks')
    expect(result.completed).toBe(3)
  })
})
