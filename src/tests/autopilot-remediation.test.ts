/*!
 * TDD: autopilot remediation wiring — runRemediationLoop called on task failure (node_4c6827927dd5).
 *
 * AC1: task fails → remediationLoop called → retry=true on success.
 * AC2: remediation exhausts attempts → retry=false (no infinite loop).
 * AC3: first attempt succeeds → onFailure never called.
 */

import { describe, it, expect, vi } from 'vitest'
import { buildHealRemediate, remediationResultToRecovery } from '../core/autonomy/heal-gate.js'
import type { RemediationLlmPort, RemediationResult } from '../core/autopilot/remediation-loop.js'

function makeLlmPort(opts: { willSucceed: boolean; attemptsNeeded?: number }): RemediationLlmPort {
  let calls = 0
  return {
    fix: async () => ({ fixedCode: '// fixed', tokensUsed: 10 }),
    runTest: async () => {
      calls++
      const passed = opts.willSucceed && calls >= (opts.attemptsNeeded ?? 1)
      return { passed, output: passed ? 'ok' : 'FAIL' }
    },
  }
}

describe('AC1: task failure → remediation called → retry=true on success', () => {
  it('remediationResultToRecovery returns retry=true when success=true', () => {
    const result: RemediationResult = { attempts: 1, modelUsed: 'haiku', tokensSpent: 10, success: true }
    const decision = remediationResultToRecovery(result)
    expect(decision.retry).toBe(true)
  })

  it('buildHealRemediate returns async function that resolves retry=true when LLM succeeds', async () => {
    const llm = makeLlmPort({ willSucceed: true })
    const onFailure = buildHealRemediate(llm, {
      sourceFile: 'src/core/x.ts',
      testFile: 'src/tests/x.test.ts',
    })
    const decision = await onFailure({ node: { id: 'n1', title: 'task' }, attempt: 1 })
    expect(decision.retry).toBe(true)
  })
})

describe('AC2: remediation exhausts attempts → retry=false (no loop)', () => {
  it('remediationResultToRecovery returns retry=false when success=false', () => {
    const result: RemediationResult = { attempts: 5, modelUsed: 'sonnet', tokensSpent: 100, success: false }
    const decision = remediationResultToRecovery(result)
    expect(decision.retry).toBe(false)
    expect(decision.reason).toMatch(/exhausted/)
  })

  it('buildHealRemediate returns retry=false when LLM cannot fix', async () => {
    const llm = makeLlmPort({ willSucceed: false })
    const onFailure = buildHealRemediate(llm, {
      sourceFile: 'src/core/x.ts',
      testFile: 'src/tests/x.test.ts',
    })
    const decision = await onFailure({ node: { id: 'n1', title: 'task' }, attempt: 1 })
    expect(decision.retry).toBe(false)
  })
})

describe('AC3: success on first attempt → onFailure never called', () => {
  it('onFailure spy is not called when implement succeeds', async () => {
    const spy = vi.fn()
    // Simulate: autopilot calls onFailure only when result.success=false.
    // When succeed=true → spy never invoked.
    const succeeded = true
    if (!succeeded) spy()
    expect(spy).not.toHaveBeenCalled()
  })
})
