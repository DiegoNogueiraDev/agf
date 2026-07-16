/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Bug-audit regression — AUDIT-055 (HIGH).
 * src/core/autonomy/implement-attempt.ts — a throw from deps.execute (e.g. a stale
 * reuse edit raising EditNotFoundError) must be caught and fall through to the next
 * path/attempt, not escape the function.
 */
import { describe, it, expect } from 'vitest'
import { attemptImplementation, type AttemptDeps } from '../core/autonomy/implement-attempt.js'
import type { ImplementationPlan, ExecutionResult } from '../core/autonomy/implementation-executor.js'
import type { ReuseDecision } from '../core/reuse/resolve-reuse.js'

const node = { id: 'node_55', title: 'Soma' }

function greenPlan(): string {
  return JSON.stringify({ edits: [{ path: 'sum.js', oldString: 'a - b', newString: 'a + b' }] })
}

describe('AUDIT-055 — execute throws are caught and fall through', () => {
  it('reuse-exact execute throwing falls through to generation', async () => {
    const reuse: ReuseDecision = {
      kind: 'exact',
      edits: [{ path: 'sum.js', oldString: 'STALE-NO-LONGER-PRESENT', newString: 'x' }],
      sourceId: 'src1',
    }
    let calls = 0
    const deps: AttemptDeps = {
      generate: async () => greenPlan(),
      execute: async (plan: ImplementationPlan): Promise<ExecutionResult> => {
        calls++
        // The reuse-exact path is the first execute call; simulate a stale edit.
        if (calls === 1) throw new Error('EditNotFoundError: oldString not found')
        return { applied: plan.edits?.map((e) => e.path) ?? [], testPassed: true, testOutput: 'ok', testExitCode: 0 }
      },
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 3, reuse })
    expect(outcome.success).toBe(true)
    expect(calls).toBeGreaterThanOrEqual(2) // reuse threw → fell through to generation
  })

  it('main-loop execute throwing on attempt 1 falls through to attempt 2', async () => {
    let calls = 0
    const deps: AttemptDeps = {
      generate: async () => greenPlan(),
      execute: async (plan: ImplementationPlan): Promise<ExecutionResult> => {
        calls++
        if (calls === 1) throw new Error('EditNotFoundError: transient')
        return { applied: plan.edits?.map((e) => e.path) ?? [], testPassed: true, testOutput: 'ok', testExitCode: 0 }
      },
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 3 })
    expect(outcome.success).toBe(true)
    expect(outcome.attempts).toBe(2)
  })

  it('execute throwing on every attempt does not escape — returns failure', async () => {
    const deps: AttemptDeps = {
      generate: async () => greenPlan(),
      execute: async (): Promise<ExecutionResult> => {
        throw new Error('EditNotFoundError: always stale')
      },
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 2 })
    expect(outcome.success).toBe(false)
    expect(outcome.error).toContain('EditNotFoundError')
  })
})
