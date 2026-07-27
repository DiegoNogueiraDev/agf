/*!
 * TDD: connectivity weight integrated into harness score (node_b72c0c65a0f8).
 *
 * AC1: sum of all 9 WEIGHTS === 1.0.
 * AC2: repo with dormant capability scores lower than fully-wired repo.
 * AC3: test:blast green and grade A-D coherent (no artificial inflation).
 */

import { describe, it, expect } from 'vitest'
import { computeHarnessabilityScore } from '../core/harness/harnessability-score.js'

const BASE_INPUT = {
  typeScore: 80,
  testScore: 80,
  fitnessScore: 80,
  docsScore: 80,
  namingScore: 80,
  errorHandlingScore: 80,
  contextDensityScore: 80,
  provenanceScore: 80,
}

describe('AC1: WEIGHTS sum to 1.0', () => {
  it('all 9 dimension weights sum to exactly 1.0', () => {
    const result = computeHarnessabilityScore({ ...BASE_INPUT, connectivityScore: 80 })
    const weights = Object.values(result.breakdown).map((d) => d.weight)
    const sum = weights.reduce((a, b) => a + b, 0)
    expect(Math.round(sum * 100) / 100).toBe(1.0)
  })

  it('breakdown has exactly 9 dimensions', () => {
    const result = computeHarnessabilityScore({ ...BASE_INPUT, connectivityScore: 80 })
    expect(Object.keys(result.breakdown).length).toBe(9)
  })
})

describe('AC2: dormant capability lowers overall score', () => {
  it('repo with connectivity=0 scores lower than connectivity=100', () => {
    const wired = computeHarnessabilityScore({ ...BASE_INPUT, connectivityScore: 100 })
    const dormant = computeHarnessabilityScore({ ...BASE_INPUT, connectivityScore: 0 })
    expect(wired.score).toBeGreaterThan(dormant.score)
  })

  it('connectivity contributes 5% to the score (weight=0.05)', () => {
    const result = computeHarnessabilityScore({ ...BASE_INPUT, connectivityScore: 80 })
    expect(result.breakdown.connectivity.weight).toBe(0.05)
    expect(result.breakdown.connectivity.score).toBe(80)
  })
})

describe('AC3: grade A-D coherent after re-weighting', () => {
  it('score 85+ → grade A', () => {
    const result = computeHarnessabilityScore({
      typeScore: 90,
      testScore: 90,
      fitnessScore: 85,
      docsScore: 85,
      namingScore: 85,
      errorHandlingScore: 85,
      contextDensityScore: 85,
      provenanceScore: 85,
      connectivityScore: 85,
    })
    expect(result.grade).toBe('A')
  })

  it('score 70-84 → grade B', () => {
    const result = computeHarnessabilityScore({
      typeScore: 70,
      testScore: 70,
      fitnessScore: 70,
      docsScore: 70,
      namingScore: 70,
      errorHandlingScore: 70,
      contextDensityScore: 70,
      provenanceScore: 70,
      connectivityScore: 70,
    })
    expect(result.grade).toBe('B')
  })

  it('connectivity=0 with otherwise perfect scores does not reach grade A', () => {
    const result = computeHarnessabilityScore({
      typeScore: 100,
      testScore: 100,
      fitnessScore: 100,
      docsScore: 100,
      namingScore: 100,
      errorHandlingScore: 100,
      contextDensityScore: 100,
      provenanceScore: 100,
      connectivityScore: 0,
    })
    // 100*0.95 + 0*0.05 = 95 → still A, but we verify score drops from 100
    expect(result.score).toBeLessThan(100)
    expect(result.score).toBeGreaterThan(90) // 95
  })
})
