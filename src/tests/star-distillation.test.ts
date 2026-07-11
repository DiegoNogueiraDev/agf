/*!
 * TDD: STaR distillation — Opus reasoning → Haiku decision-table entries (node_69554925af81).
 *
 * AC1: Given a reasoned scenario (expensive model), When distilled,
 *      Then produces decision-table entries (DecisionObservation[]).
 * AC2: Given those entries, When a cheap model runs the same scenario,
 *      Then it can look up the compiled decision without re-reasoning.
 */

import { describe, it, expect } from 'vitest'
import { distillStar } from '../core/learning/star-distillation.js'
import { decisionKey } from '../core/learning/decision-key.js'
import type { ReasoningTrace } from '../core/learning/star-distillation.js'

const SAMPLE_TRACE: ReasoningTrace = {
  domain: 'cli',
  phase: 'BUILD',
  role: 'implementer',
  input: 'Which pattern to use for caching token counts?',
  reasoning: 'We need a map keyed by content hash; LRU eviction keeps it bounded.',
  conclusion: 'Use LRU cache keyed by sha256 of input text.',
  success: true,
  ts: 1000000,
}

describe('AC1: reasoned scenario produces DecisionObservation entries', () => {
  it('returns one observation per trace', () => {
    const obs = distillStar([SAMPLE_TRACE])
    expect(obs).toHaveLength(1)
  })

  it('observation key matches deterministic decisionKey for same context', () => {
    const obs = distillStar([SAMPLE_TRACE])
    const expectedKey = decisionKey({
      domain: SAMPLE_TRACE.domain,
      phase: SAMPLE_TRACE.phase,
      role: SAMPLE_TRACE.role,
      input: SAMPLE_TRACE.input,
    })
    expect(obs[0].key).toBe(expectedKey)
  })

  it('observation.decision contains the conclusion from reasoning', () => {
    const obs = distillStar([SAMPLE_TRACE])
    const decision = obs[0].decision as { conclusion: string }
    expect(decision.conclusion).toBe(SAMPLE_TRACE.conclusion)
  })

  it('observation.success reflects the trace success flag', () => {
    const obs = distillStar([SAMPLE_TRACE])
    expect(obs[0].success).toBe(true)
  })

  it('failed trace produces success=false observation', () => {
    const failedTrace: ReasoningTrace = { ...SAMPLE_TRACE, success: false }
    const obs = distillStar([failedTrace])
    expect(obs[0].success).toBe(false)
  })
})

describe('AC2: cheap model can replay without re-reasoning (decision-table lookup)', () => {
  it('multiple traces for same scenario produce entries that compile via groupByKey logic', () => {
    const traces: ReasoningTrace[] = [SAMPLE_TRACE, { ...SAMPLE_TRACE, ts: 2000000 }]
    const obs = distillStar(traces)
    // Both should share the same key → learning-compiler groups them
    expect(obs[0].key).toBe(obs[1].key)
    expect(obs).toHaveLength(2)
  })

  it('empty trace list returns empty observations', () => {
    expect(distillStar([])).toHaveLength(0)
  })
})
