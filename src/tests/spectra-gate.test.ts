/*!
 * TDD: spectra-gate — hook detects spectra score regression at done (node_311fa61c7e0c).
 *
 * AC1: done that drops a spectrum beyond delta → regression signaled.
 * AC2: stable/improving scores → silent pass.
 * AC3: opt-out via env → gate disabled.
 */

import { describe, it, expect } from 'vitest'
import { checkSpectraRegression, type SpectraRegressionInput } from '../core/hooks/spectra-regression-gate.js'

const STABLE_SCORES = { autonomy: 80, precision: 75, selfLearning: 60, selfHealing: 70, memory: 65 }

describe('AC1: regression when a spectrum drops beyond delta', () => {
  it('flags precision regression when it drops by more than the delta', () => {
    const input: SpectraRegressionInput = {
      baseline: STABLE_SCORES,
      current: { ...STABLE_SCORES, precision: 60 }, // dropped 15
      deltaThreshold: 10,
      disabled: false,
    }
    const result = checkSpectraRegression(input)
    expect(result.regression).toBe(true)
    expect(result.regressedSpectra).toContain('precision')
  })

  it('does not flag when drop is within threshold', () => {
    const input: SpectraRegressionInput = {
      baseline: STABLE_SCORES,
      current: { ...STABLE_SCORES, precision: 68 }, // dropped 7 < 10
      deltaThreshold: 10,
      disabled: false,
    }
    const result = checkSpectraRegression(input)
    expect(result.regression).toBe(false)
  })

  it('reports multiple regressed spectra', () => {
    const input: SpectraRegressionInput = {
      baseline: STABLE_SCORES,
      current: { ...STABLE_SCORES, precision: 50, selfHealing: 50 },
      deltaThreshold: 10,
      disabled: false,
    }
    const result = checkSpectraRegression(input)
    expect(result.regression).toBe(true)
    expect(result.regressedSpectra).toContain('precision')
    expect(result.regressedSpectra).toContain('selfHealing')
  })
})

describe('AC2: stable or improving scores → silent pass', () => {
  it('returns regression=false when all spectra are stable', () => {
    const input: SpectraRegressionInput = {
      baseline: STABLE_SCORES,
      current: STABLE_SCORES,
      deltaThreshold: 10,
      disabled: false,
    }
    const result = checkSpectraRegression(input)
    expect(result.regression).toBe(false)
    expect(result.regressedSpectra).toEqual([])
  })

  it('returns regression=false when all spectra improve', () => {
    const input: SpectraRegressionInput = {
      baseline: STABLE_SCORES,
      current: { autonomy: 90, precision: 85, selfLearning: 70, selfHealing: 80, memory: 75 },
      deltaThreshold: 10,
      disabled: false,
    }
    const result = checkSpectraRegression(input)
    expect(result.regression).toBe(false)
  })
})

describe('AC3: opt-out via disabled flag → gate skipped', () => {
  it('returns regression=false when disabled=true regardless of scores', () => {
    const input: SpectraRegressionInput = {
      baseline: STABLE_SCORES,
      current: { autonomy: 0, precision: 0, selfLearning: 0, selfHealing: 0, memory: 0 },
      deltaThreshold: 5,
      disabled: true,
    }
    const result = checkSpectraRegression(input)
    expect(result.regression).toBe(false)
    expect(result.skipped).toBe(true)
  })
})
