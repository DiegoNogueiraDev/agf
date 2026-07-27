/*!
 * §node_0e7bb74470aa — Tests for runGuardrailPipeline
 */
import { describe, it, expect } from 'vitest'
import { runGuardrailPipeline } from '../core/observability/guardrail-adapter.js'
import type { Guardrail, GuardrailContext } from '../core/observability/guardrail-adapter.js'

const ctx: GuardrailContext = { input: 'test input', metadata: {} }

describe('runGuardrailPipeline', () => {
  it('returns passed=true when all guardrails pass', () => {
    const g: Guardrail = {
      name: 'always-pass',
      position: 'pre',
      strategy: 'fail_closed',
      run: () => ({ passed: true, score: 1.0, name: 'always-pass', strategy: 'fail_closed' }),
    }
    const result = runGuardrailPipeline([g], ctx)
    expect(result.allPassed).toBe(true)
    expect(result.results).toHaveLength(1)
  })

  it('returns allPassed=false when a fail_closed guardrail fails', () => {
    const g: Guardrail = {
      name: 'always-fail',
      position: 'pre',
      strategy: 'fail_closed',
      run: () => ({ passed: false, score: 0, name: 'always-fail', strategy: 'fail_closed' }),
    }
    const result = runGuardrailPipeline([g], ctx)
    expect(result.allPassed).toBe(false)
    expect(result.blockingFailures).toHaveLength(1)
  })

  it('returns allPassed=true for empty guardrails list', () => {
    const result = runGuardrailPipeline([], ctx)
    expect(result.allPassed).toBe(true)
    expect(result.results).toHaveLength(0)
  })

  it('fail_open strategy does not block even when guardrail throws', () => {
    const g: Guardrail = {
      name: 'throws',
      position: 'pre',
      strategy: 'fail_open',
      run: () => {
        throw new Error('oops')
      },
    }
    const result = runGuardrailPipeline([g], ctx)
    expect(result.allPassed).toBe(true)
  })
})
