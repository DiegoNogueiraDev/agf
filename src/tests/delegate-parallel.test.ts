/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { delegateSubtasksParallel, type ParallelDelegateDeps } from '../core/autonomy/delegate-parallel.js'

function fakeDeps(delayMs: number = 0, failIds: string[] = []): ParallelDelegateDeps {
  return {
    runSubagent: async (subtask) => {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
      if (failIds.includes(subtask.id)) {
        return { success: false, tokensUsed: 10, summary: `Failed: ${subtask.title}` }
      }
      return { success: true, tokensUsed: 50, summary: `Done: ${subtask.title}` }
    },
  }
}

describe('delegateSubtasksParallel — parallel mode', () => {
  const subtasks = [
    { id: 'task_1', title: 'Search codebase' },
    { id: 'task_2', title: 'Analyze patterns' },
    { id: 'task_3', title: 'Implement changes' },
  ]

  it('should spawn agents em paralelo', async () => {
    const startedAt = Date.now()
    const result = await delegateSubtasksParallel(subtasks, fakeDeps(50))
    const duration = Date.now() - startedAt
    expect(duration).toBeLessThan(150)
    expect(result.completed).toBe(3)
    expect(result.stopped).toBe('all_done')
  })

  it('should aggregate results com status por agente', async () => {
    const result = await delegateSubtasksParallel(subtasks, fakeDeps())
    expect(result.results).toHaveLength(3)
    for (const r of result.results) {
      expect(r.id).toBeDefined()
      expect(r.title).toBeDefined()
      expect(r.success).toBe(true)
      expect(r.tokensUsed).toBeGreaterThan(0)
    }
  })

  it('should handle failures without stopping others', async () => {
    const result = await delegateSubtasksParallel(subtasks, fakeDeps(0, ['task_2']))
    expect(result.completed).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.results[0]?.success).toBe(true)
    expect(result.results[1]?.success).toBe(false)
    expect(result.results[2]?.success).toBe(true)
  })

  it('should respect abort signal', async () => {
    const ac = new AbortController()
    ac.abort()
    const result = await delegateSubtasksParallel(subtasks, fakeDeps(100), { signal: ac.signal })
    expect(result.stopped).toBe('aborted')
    expect(result.completed).toBe(0)
  })

  it('should summarize tokens', async () => {
    const result = await delegateSubtasksParallel(subtasks, fakeDeps())
    expect(result.tokensUsed).toBe(150)
    expect(result.completed).toBe(3)
  })

  it('should handle empty subtasks list', async () => {
    const result = await delegateSubtasksParallel([], fakeDeps())
    expect(result.completed).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.tokensUsed).toBe(0)
    expect(result.stopped).toBe('all_done')
  })

  it('should call onResult callback per agent', async () => {
    const calls: string[] = []
    const result = await delegateSubtasksParallel(subtasks, fakeDeps(), {
      onResult: (r) => calls.push(r.id),
    })
    expect(calls).toEqual(['task_1', 'task_2', 'task_3'])
  })

  it('should handle all failures', async () => {
    const result = await delegateSubtasksParallel(subtasks, fakeDeps(0, ['task_1', 'task_2', 'task_3']))
    expect(result.completed).toBe(0)
    expect(result.failed).toBe(3)
    expect(result.stopped).toBe('all_done')
  })

  it('should bound in-flight subagents when maxConcurrent is set', async () => {
    let active = 0
    let peak = 0
    const deps: ParallelDelegateDeps = {
      runSubagent: async (subtask) => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 30))
        active--
        return { success: true, tokensUsed: 10, summary: `Done: ${subtask.title}` }
      },
    }
    const result = await delegateSubtasksParallel(subtasks, deps, { maxConcurrent: 1 })
    expect(peak).toBe(1)
    expect(result.completed).toBe(3)
  })

  it('should stay unbounded when maxConcurrent is absent (default identical to today)', async () => {
    let active = 0
    let peak = 0
    const deps: ParallelDelegateDeps = {
      runSubagent: async (subtask) => {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 30))
        active--
        return { success: true, tokensUsed: 10, summary: `Done: ${subtask.title}` }
      },
    }
    const result = await delegateSubtasksParallel(subtasks, deps)
    expect(peak).toBe(3)
    expect(result.completed).toBe(3)
  })
})
