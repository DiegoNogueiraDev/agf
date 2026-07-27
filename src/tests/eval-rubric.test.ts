import { describe, it, expect } from 'vitest'
import { computeQualityScore } from '../core/economy/eval-rubric.js'
import type { EvalScore } from '../core/economy/eval-rubric.js'

function score(correctness: number, ac_coverage: number): EvalScore {
  return { correctness, ac_coverage, token_cost_usd: 0, latency_ms: 0, hallucination_count: 0 }
}

describe('computeQualityScore', () => {
  it('perfect score is not a degrade', () => {
    const result = computeQualityScore(score(1, 1))
    expect(result.qualityScore).toBe(1)
    expect(result.isDegrade).toBe(false)
  })

  it('averages correctness and ac_coverage', () => {
    const result = computeQualityScore(score(0.6, 1.0))
    expect(result.qualityScore).toBeCloseTo(0.8)
  })

  it('below 0.8 threshold is a degrade', () => {
    const result = computeQualityScore(score(0.5, 0.5))
    expect(result.qualityScore).toBeCloseTo(0.5)
    expect(result.isDegrade).toBe(true)
  })

  it('exactly at threshold is not a degrade', () => {
    const result = computeQualityScore(score(0.6, 1.0))
    expect(result.isDegrade).toBe(false)
  })

  it('just below threshold is a degrade', () => {
    const result = computeQualityScore(score(0.5, 0.9))
    expect(result.qualityScore).toBeCloseTo(0.7)
    expect(result.isDegrade).toBe(true)
  })

  it('zero scores produce maximum degrade', () => {
    const result = computeQualityScore(score(0, 0))
    expect(result.qualityScore).toBe(0)
    expect(result.isDegrade).toBe(true)
  })

  it('ignores token_cost_usd, latency_ms, and hallucination_count', () => {
    const a = computeQualityScore({
      correctness: 0.9,
      ac_coverage: 0.9,
      token_cost_usd: 0,
      latency_ms: 0,
      hallucination_count: 0,
    })
    const b = computeQualityScore({
      correctness: 0.9,
      ac_coverage: 0.9,
      token_cost_usd: 99,
      latency_ms: 5000,
      hallucination_count: 10,
    })
    expect(a.qualityScore).toBeCloseTo(b.qualityScore)
  })
})
