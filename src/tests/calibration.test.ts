/*!
 * Task node_2c8024f5331c — Brier score + ECE calibration metrics.
 *
 * AC1: brierScore([0.9,0.1,0.8],[1,0,1]) → exact value (within 1e-9)
 * AC2: ece(bins) → number in [0,1]
 * AC3: brierScore([],[]) → throws LearningError
 */

import { describe, it, expect } from 'vitest'
import { brierScore, ece, LearningError, type EceBin } from '../core/learning/calibration.js'

describe('brierScore', () => {
  it('computes brier score correctly for [0.9,0.1,0.8] vs [1,0,1] (AC1)', () => {
    // Brier = mean((0.9-1)^2 + (0.1-0)^2 + (0.8-1)^2) = (0.01 + 0.01 + 0.04)/3 = 0.06/3 = 0.02
    const result = brierScore([0.9, 0.1, 0.8], [1, 0, 1])
    expect(result).toBeCloseTo(0.02, 9)
  })

  it('throws LearningError on empty input (AC3)', () => {
    expect(() => brierScore([], [])).toThrow(LearningError)
  })

  it('throws LearningError when lengths differ', () => {
    expect(() => brierScore([0.5], [1, 0])).toThrow(LearningError)
  })

  it('returns 0 for perfect predictions', () => {
    expect(brierScore([1, 0, 1], [1, 0, 1])).toBeCloseTo(0, 9)
  })

  it('returns 1 for worst predictions', () => {
    // (1-0)^2 + (0-1)^2 + (1-0)^2 = 3/3 = 1
    expect(brierScore([1, 0, 1], [0, 1, 0])).toBeCloseTo(1, 9)
  })
})

describe('ece', () => {
  it('returns a number in [0,1] for valid bins (AC2)', () => {
    const bins: EceBin[] = [
      { meanPredicted: 0.2, meanActual: 0.25, n: 10 },
      { meanPredicted: 0.5, meanActual: 0.48, n: 20 },
      { meanPredicted: 0.8, meanActual: 0.78, n: 15 },
    ]
    const result = ece(bins)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(1)
  })

  it('returns 0 for perfectly calibrated bins', () => {
    const bins: EceBin[] = [
      { meanPredicted: 0.3, meanActual: 0.3, n: 10 },
      { meanPredicted: 0.7, meanActual: 0.7, n: 10 },
    ]
    expect(ece(bins)).toBeCloseTo(0, 9)
  })

  it('returns 0 for empty bins', () => {
    expect(ece([])).toBe(0)
  })
})
