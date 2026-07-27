/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { computeHarnessabilityScore } from '../core/harness/harnessability-score.js'

describe('computeHarnessabilityScore', () => {
  it('returns grade A for perfect scores across all dimensions', () => {
    const result = computeHarnessabilityScore({
      typeScore: 100,
      testScore: 100,
      fitnessScore: 100,
      docsScore: 100,
    })
    expect(result.score).toBe(100)
    expect(result.grade).toBe('A')
  })

  it('returns grade D for very low scores', () => {
    const result = computeHarnessabilityScore({
      typeScore: 10,
      testScore: 10,
      fitnessScore: 10,
      docsScore: 10,
    })
    expect(result.grade).toBe('D')
    expect(result.score).toBeLessThan(55)
  })

  it('computes weighted score correctly', () => {
    const result = computeHarnessabilityScore({
      typeScore: 100,
      testScore: 100,
      fitnessScore: 100,
      docsScore: 100,
      namingScore: 0,
      errorHandlingScore: 0,
      contextDensityScore: 0,
      provenanceScore: 0,
    })
    const expected = 100 * 0.25 + 100 * 0.25 + 100 * 0.15 + 100 * 0.1
    expect(result.score).toBe(expected)
    expect(result.breakdown.types.weight).toBe(0.25)
    expect(result.breakdown.provenance.weight).toBe(0.05)
  })

  it('uses default 100 for optional dimensions when omitted', () => {
    const result = computeHarnessabilityScore({
      typeScore: 0,
      testScore: 0,
      fitnessScore: 0,
      docsScore: 0,
    })
    const expected = 0 + 0 + 0 + 0 + 100 * 0.1 + 100 * 0.05 + 100 * 0.05 + 100 * 0.05 + 100 * 0.05
    expect(result.score).toBe(expected)
  })

  it('rounds score to one decimal place', () => {
    const result = computeHarnessabilityScore({
      typeScore: 33.33,
      testScore: 33.33,
      fitnessScore: 33.33,
      docsScore: 33.33,
    })
    expect(result.score.toString()).toMatch(/^\d+\.?\d$/)
  })

  it('breaks boundary between C and B at 70', () => {
    const { grade, score } = computeHarnessabilityScore({
      typeScore: 70,
      testScore: 70,
      fitnessScore: 70,
      docsScore: 70,
    })
    expect(score).toBeGreaterThanOrEqual(70)
    expect(grade).toBe('B')
  })

  it('breaks boundary between D and C at 55', () => {
    const { grade, score } = computeHarnessabilityScore({
      typeScore: 55,
      testScore: 55,
      fitnessScore: 55,
      docsScore: 55,
    })
    expect(score).toBeGreaterThanOrEqual(55)
    expect(grade).toBe('C')
  })

  it('includes breakdown with all 9 dimensions', () => {
    const result = computeHarnessabilityScore({
      typeScore: 80,
      testScore: 70,
      fitnessScore: 60,
      docsScore: 50,
      namingScore: 90,
      errorHandlingScore: 40,
      contextDensityScore: 30,
      provenanceScore: 20,
      connectivityScore: 10,
    })
    const dims = Object.keys(result.breakdown)
    expect(dims).toEqual([
      'types',
      'tests',
      'fitness',
      'docs',
      'naming',
      'errors',
      'context',
      'provenance',
      'connectivity',
    ])
  })
})
