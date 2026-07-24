/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_aa95187d6e16 — the implement retry-loop burned a real generate() call per
 * attempt even when every attempt failed IDENTICALLY (no progress). A no-progress
 * guard aborts early when the current failure equals the previous attempt's, so an
 * unresolvable task stops instead of spending the full maxAttempts × maxSteps budget.
 */

import { describe, it, expect } from 'vitest'
import { attemptImplementation, type AttemptDeps } from '../core/autonomy/implement-attempt.js'
import type { ImplementationPlan, ExecutionResult } from '../core/autonomy/implementation-executor.js'

const node = { id: 'n1', title: 'task' }
const plan = (): string => JSON.stringify({ edits: [{ path: 'x.js', oldString: 'a', newString: 'b' }] })

describe('attemptImplementation — no-progress guard on identical failures', () => {
  it('stops once the failure repeats AND the effort ladder is exhausted (no wasted call)', async () => {
    // effort escalates low→medium→high across attempts 1-3; attempt 4 would repeat
    // 'high' with the SAME failure → no progress possible → stop before generating.
    let generateCalls = 0
    const deps: AttemptDeps = {
      generate: async () => {
        generateCalls++
        return plan()
      },
      execute: async (p: ImplementationPlan): Promise<ExecutionResult> => ({
        applied: p.edits?.map((e) => e.path) ?? [],
        testPassed: false,
        testOutput: 'FAILED: assertion X !== Y', // identical every attempt
        testExitCode: 1,
      }),
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 4 })
    expect(outcome.success).toBe(false)
    // attempts 1(low) 2(medium) 3(high) run; attempt 4 (high again, same fail) is skipped
    expect(generateCalls).toBe(3)
  })

  it('does NOT stop while effort is still escalating (the harder retry gets its shot)', async () => {
    // maxAttempts=3: effort low→medium→high — every retry is a genuinely harder try,
    // so the guard must NOT cut it even though the failure is identical.
    let generateCalls = 0
    const deps: AttemptDeps = {
      generate: async () => {
        generateCalls++
        return plan()
      },
      execute: async (p: ImplementationPlan): Promise<ExecutionResult> => ({
        applied: p.edits?.map((e) => e.path) ?? [],
        testPassed: false,
        testOutput: 'FAILED: same error', // identical, but effort keeps rising
        testExitCode: 1,
      }),
    }
    await attemptImplementation(deps, { node, maxAttempts: 3 })
    expect(generateCalls).toBe(3) // full ladder — escalation respected
  })

  it('uses the full budget when each attempt fails DIFFERENTLY (progress is being made)', async () => {
    let generateCalls = 0
    let execCalls = 0
    const deps: AttemptDeps = {
      generate: async () => {
        generateCalls++
        return plan()
      },
      execute: async (p: ImplementationPlan): Promise<ExecutionResult> => {
        execCalls++
        return {
          applied: p.edits?.map((e) => e.path) ?? [],
          testPassed: false,
          testOutput: `FAILED: distinct error ${execCalls}`, // different each time
          testExitCode: 1,
        }
      },
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 4 })
    expect(outcome.success).toBe(false)
    expect(generateCalls).toBe(4) // full budget — never the same failure twice
  })

  it('a passing attempt still returns success (no false early-stop)', async () => {
    const deps: AttemptDeps = {
      generate: async () => plan(),
      execute: async (p: ImplementationPlan): Promise<ExecutionResult> => ({
        applied: p.edits?.map((e) => e.path) ?? [],
        testPassed: true,
        testOutput: 'ok',
        testExitCode: 0,
      }),
    }
    const outcome = await attemptImplementation(deps, { node, maxAttempts: 3 })
    expect(outcome.success).toBe(true)
  })
})
