/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * B5 — parallelism budget guard: hard token ceiling + kill-switch on fan-out.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { delegateSubtasksParallel, type ParallelDelegateDeps } from '../core/autonomy/delegate-parallel.js'
import { createBudgetGuard } from '../core/autonomy/budget-guard.js'
import { getLogBuffer, clearLogBuffer } from '../core/utils/logger.js'

function countingDeps(tokensEach: number, launched: string[]): ParallelDelegateDeps {
  return {
    runSubagent: async (subtask) => {
      launched.push(subtask.id)
      return { success: true, tokensUsed: tokensEach, summary: `Done: ${subtask.title}` }
    },
  }
}

describe('delegateSubtasksParallel — budget guard (B5)', () => {
  const subtasks = [
    { id: 'task_1', title: 'A' },
    { id: 'task_2', title: 'B' },
    { id: 'task_3', title: 'C' },
    { id: 'task_4', title: 'D' },
  ]

  beforeEach(() => {
    clearLogBuffer()
  })

  it('aborts fan-out when token ceiling is exceeded and logs the trip', async () => {
    // arrange: each subagent spends 50 tokens, ceiling = 100 → trips after 2
    const launched: string[] = []
    const budget = createBudgetGuard(100)

    // act
    const report = await delegateSubtasksParallel(subtasks, countingDeps(50, launched), { budget })

    // assert: stopped for budget, not all subtasks ran, trip logged
    expect(report.stopped).toBe('budget_exceeded')
    expect(launched.length).toBeLessThan(subtasks.length)
    expect(budget.exceeded()).toBe(true)

    const tripLog = getLogBuffer().some((e) => e.message.includes('budget') || e.context?.lever === 'budget_guard')
    expect(tripLog).toBe(true)
  })

  it('runs all subtasks and finishes all_done when within budget', async () => {
    // arrange: generous ceiling
    const launched: string[] = []
    const budget = createBudgetGuard(10_000)

    // act
    const report = await delegateSubtasksParallel(subtasks, countingDeps(50, launched), { budget })

    // assert
    expect(report.stopped).toBe('all_done')
    expect(report.completed).toBe(4)
    expect(launched).toHaveLength(4)
  })

  it('default (no budget) behaves exactly as before — all_done, all launched', async () => {
    // arrange
    const launched: string[] = []

    // act
    const report = await delegateSubtasksParallel(subtasks, countingDeps(50, launched))

    // assert
    expect(report.stopped).toBe('all_done')
    expect(report.completed).toBe(4)
    expect(launched).toHaveLength(4)
    expect(report.tokensUsed).toBe(200)
  })
})
