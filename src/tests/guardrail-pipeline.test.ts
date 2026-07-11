/*!
 * Tests for guardrail-adapter.ts — runGuardrailPipeline pure pipeline executor.
 *
 * runGuardrailPipeline(guardrails, context, options?) accepts injectable
 * Guardrail objects (each with a `run` function) so all behavior is testable
 * without DB. No FS, no network.
 *
 * Covers: empty pipeline, all-pass, fail_closed → blockingFailures,
 * fail_open failure (not blocking), throw strategy handling, mixed pipelines,
 * allPassed invariant, results array completeness.
 */

import { describe, it, expect } from 'vitest'
import { runGuardrailPipeline } from '../core/observability/guardrail-adapter.js'
import type { Guardrail, GuardrailContext, GuardrailResult } from '../core/observability/guardrail-adapter.js'

// ── helpers ───────────────────────────────────────────────────────────────────

const CTX: GuardrailContext = { projectPath: '/test/project' }

function passing(name: string, strategy: 'fail_open' | 'fail_closed' = 'fail_closed'): Guardrail {
  return {
    name,
    position: 'pre',
    strategy,
    run: (): GuardrailResult => ({ passed: true, score: 1.0, name, details: 'ok', strategy }),
  }
}

function failing(name: string, strategy: 'fail_open' | 'fail_closed' = 'fail_closed'): Guardrail {
  return {
    name,
    position: 'pre',
    strategy,
    run: (): GuardrailResult => ({ passed: false, score: 0.0, name, details: 'failed', strategy }),
  }
}

function throwing(name: string, strategy: 'fail_open' | 'fail_closed' = 'fail_closed'): Guardrail {
  return {
    name,
    position: 'pre',
    strategy,
    run: (): GuardrailResult => {
      throw new Error(`${name} exploded`)
    },
  }
}

// ── empty pipeline ────────────────────────────────────────────────────────────

describe('runGuardrailPipeline — empty pipeline', () => {
  it('returns allPassed=true for empty guardrails', () => {
    const result = runGuardrailPipeline([], CTX)
    expect(result.allPassed).toBe(true)
  })

  it('returns empty results array', () => {
    const result = runGuardrailPipeline([], CTX)
    expect(result.results).toHaveLength(0)
  })

  it('returns empty blockingFailures array', () => {
    const result = runGuardrailPipeline([], CTX)
    expect(result.blockingFailures).toHaveLength(0)
  })
})

// ── all passing ───────────────────────────────────────────────────────────────

describe('runGuardrailPipeline — all passing', () => {
  it('allPassed=true when all guardrails pass', () => {
    const result = runGuardrailPipeline([passing('a'), passing('b'), passing('c')], CTX)
    expect(result.allPassed).toBe(true)
  })

  it('no blocking failures when all pass', () => {
    const result = runGuardrailPipeline([passing('x'), passing('y')], CTX)
    expect(result.blockingFailures).toHaveLength(0)
  })

  it('results array has one entry per guardrail', () => {
    const result = runGuardrailPipeline([passing('p1'), passing('p2'), passing('p3')], CTX)
    expect(result.results).toHaveLength(3)
  })
})

// ── fail_closed — blocking failures ──────────────────────────────────────────

describe('runGuardrailPipeline — fail_closed failures', () => {
  it('allPassed=false when one fail_closed guardrail fails', () => {
    const result = runGuardrailPipeline([passing('ok'), failing('bad', 'fail_closed')], CTX)
    expect(result.allPassed).toBe(false)
  })

  it('failed fail_closed guardrail appears in blockingFailures', () => {
    const result = runGuardrailPipeline([failing('blocker', 'fail_closed')], CTX)
    expect(result.blockingFailures).toHaveLength(1)
    expect(result.blockingFailures[0].name).toBe('blocker')
  })

  it('multiple fail_closed failures all appear in blockingFailures', () => {
    const result = runGuardrailPipeline(
      [failing('b1', 'fail_closed'), failing('b2', 'fail_closed'), passing('ok')],
      CTX,
    )
    expect(result.blockingFailures).toHaveLength(2)
  })
})

// ── fail_open — non-blocking failures ────────────────────────────────────────

describe('runGuardrailPipeline — fail_open failures', () => {
  it('allPassed=false when fail_open guardrail fails', () => {
    const result = runGuardrailPipeline([failing('soft', 'fail_open')], CTX)
    expect(result.allPassed).toBe(false)
  })

  it('fail_open failure does NOT appear in blockingFailures', () => {
    const result = runGuardrailPipeline([failing('soft', 'fail_open')], CTX)
    expect(result.blockingFailures).toHaveLength(0)
  })

  it('fail_open failure still appears in results', () => {
    const result = runGuardrailPipeline([failing('soft', 'fail_open')], CTX)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].passed).toBe(false)
  })
})

// ── throwing guardrails ───────────────────────────────────────────────────────

describe('runGuardrailPipeline — throwing guardrails', () => {
  it('fail_closed throw → treated as blocking failure', () => {
    const result = runGuardrailPipeline([throwing('exploder', 'fail_closed')], CTX)
    expect(result.blockingFailures).toHaveLength(1)
    expect(result.allPassed).toBe(false)
  })

  it('fail_open throw → treated as passed (fail_open)', () => {
    const result = runGuardrailPipeline([throwing('soft-boom', 'fail_open')], CTX)
    expect(result.blockingFailures).toHaveLength(0)
    expect(result.results[0].passed).toBe(true)
  })

  it('error message from throw appears in details', () => {
    const result = runGuardrailPipeline([throwing('detail-check', 'fail_closed')], CTX)
    expect(result.results[0].details).toContain('detail-check exploded')
  })
})

// ── mixed pipeline ────────────────────────────────────────────────────────────

describe('runGuardrailPipeline — mixed pipeline', () => {
  it('correctly classifies passing, fail_open, and fail_closed in one pipeline', () => {
    const result = runGuardrailPipeline(
      [passing('p'), failing('soft', 'fail_open'), failing('hard', 'fail_closed')],
      CTX,
    )
    expect(result.allPassed).toBe(false)
    expect(result.results).toHaveLength(3)
    expect(result.blockingFailures).toHaveLength(1)
    expect(result.blockingFailures[0].name).toBe('hard')
  })

  it('results preserve insertion order', () => {
    const result = runGuardrailPipeline([passing('first'), failing('second', 'fail_open'), passing('third')], CTX)
    expect(result.results[0].name).toBe('first')
    expect(result.results[1].name).toBe('second')
    expect(result.results[2].name).toBe('third')
  })
})
