import { describe, it, expect } from 'vitest'
import { ebbinghausWeight, weightAt, halfLifeMs, tauFromConstitution, DEFAULT_TAU_MS } from '../core/learning/decay.js'

const TAU = DEFAULT_TAU_MS

describe('ebbinghausWeight', () => {
  it('returns 1 for age=0 (just observed)', () => {
    expect(ebbinghausWeight(0)).toBeCloseTo(1, 5)
  })

  it('returns ~0.368 at age=τ (one time constant)', () => {
    expect(ebbinghausWeight(TAU)).toBeCloseTo(1 / Math.E, 3)
  })

  it('returns 1 for negative age (future event clamp)', () => {
    expect(ebbinghausWeight(-1000)).toBe(1)
  })

  it('returns 0 when weight drops below floor', () => {
    const result = ebbinghausWeight(TAU * 100, { floor: 0.01 })
    expect(result).toBe(0)
  })

  it('returns close to 0 for very large ages', () => {
    expect(ebbinghausWeight(TAU * 1000)).toBeLessThan(0.0001)
  })
})

describe('weightAt', () => {
  it('delegates to ebbinghausWeight with now - observedAt', () => {
    const nowMs = TAU // one τ after epoch
    const result = weightAt(0, nowMs)
    expect(result).toBeCloseTo(1 / Math.E, 3)
  })

  it('clamps negative difference to 0 (future observation)', () => {
    // observed in the future → treated as age 0 → weight 1
    const result = weightAt(1000, 0)
    expect(result).toBeCloseTo(1, 5)
  })
})

describe('halfLifeMs', () => {
  it('returns τ * ln(2) for default τ', () => {
    expect(halfLifeMs()).toBeCloseTo(TAU * Math.LN2, 0)
  })

  it('weight at halfLifeMs equals 0.5', () => {
    const hl = halfLifeMs(TAU)
    expect(ebbinghausWeight(hl, { tauMs: TAU })).toBeCloseTo(0.5, 3)
  })
})

describe('tauFromConstitution', () => {
  it('returns DEFAULT_TAU_MS for undefined constitution', () => {
    expect(tauFromConstitution(undefined)).toBe(DEFAULT_TAU_MS)
  })

  it('reads learning.decay_tau_days from constitution', () => {
    const result = tauFromConstitution({ 'learning.decay_tau_days': 10 })
    const expected = 10 * 24 * 60 * 60 * 1000
    expect(result).toBe(expected)
  })

  it('falls back to DEFAULT_TAU_MS for invalid value', () => {
    expect(tauFromConstitution({ 'learning.decay_tau_days': 'bad' })).toBe(DEFAULT_TAU_MS)
    expect(tauFromConstitution({ 'learning.decay_tau_days': -5 })).toBe(DEFAULT_TAU_MS)
  })
})
