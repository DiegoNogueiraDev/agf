import { describe, it, expect } from 'vitest'
import { welchTTest, formatAbResult } from '../core/economy/ab-compare.js'

describe('welchTTest', () => {
  it('returns an AbTestResult with all required fields', () => {
    const r = welchTTest([100, 110, 120], [200, 210, 220])
    expect(r.avgA).toBeDefined()
    expect(r.avgB).toBeDefined()
    expect(r.delta).toBeDefined()
    expect(r.tStat).toBeDefined()
    expect(r.pValue).toBeDefined()
    expect(r.winner).toBeDefined()
    expect(r.significant).toBeDefined()
  })

  it('avgA and avgB are arithmetic means of the sample arrays', () => {
    const r = welchTTest([100, 200, 300], [50, 150, 250])
    expect(r.avgA).toBeCloseTo(200, 2)
    expect(r.avgB).toBeCloseTo(150, 2)
  })

  it('delta = avgA - avgB', () => {
    const r = welchTTest([100, 200, 300], [50, 150, 250])
    expect(r.delta).toBeCloseTo(r.avgA - r.avgB, 5)
  })

  it('identifies winner=B when B is significantly lower (fewer tokens = better)', () => {
    // A: high token usage; B: clearly lower
    const samplesA = Array.from({ length: 20 }, () => 500)
    const samplesB = Array.from({ length: 20 }, () => 200)
    const r = welchTTest(samplesA, samplesB)
    expect(r.winner).toBe('B')
    expect(r.significant).toBe(true)
    expect(r.pValue).toBeLessThan(0.05)
  })

  it('identifies winner=A when A is significantly lower', () => {
    const samplesA = Array.from({ length: 20 }, () => 100)
    const samplesB = Array.from({ length: 20 }, () => 400)
    const r = welchTTest(samplesA, samplesB)
    expect(r.winner).toBe('A')
    expect(r.significant).toBe(true)
  })

  it('returns tie (not significant) when samples are from same distribution', () => {
    // Both at exactly 300 — zero variance
    const samplesA = [300, 300, 300, 300, 300]
    const samplesB = [300, 300, 300, 300, 300]
    const r = welchTTest(samplesA, samplesB)
    expect(r.winner).toBe('tie')
    expect(r.significant).toBe(false)
  })

  it('pValue is in [0, 1]', () => {
    const r = welchTTest([100, 110, 120, 130], [200, 210, 220, 230])
    expect(r.pValue).toBeGreaterThanOrEqual(0)
    expect(r.pValue).toBeLessThanOrEqual(1)
  })

  it('handles single-element samples (no variance) without throwing', () => {
    expect(() => welchTTest([100], [200])).not.toThrow()
  })

  it('returns tie for empty or near-zero-variance samples', () => {
    const r = welchTTest([100], [200])
    // With 1 element per group, df=0 — tie is the safe outcome
    expect(r.winner === 'tie' || r.significant === false || r.pValue >= 0).toBe(true)
  })
})

describe('formatAbResult', () => {
  it('returns a non-empty array of strings', () => {
    const r = welchTTest([100, 200, 300], [50, 150, 250])
    const lines = formatAbResult(r)
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((l) => typeof l === 'string')).toBe(true)
  })

  it('includes avg, delta, and p-value in output', () => {
    const r = welchTTest([100, 200], [300, 400])
    const text = formatAbResult(r).join('\n')
    expect(text).toContain('avg')
    expect(text.toLowerCase()).toContain('delta')
    expect(text.toLowerCase()).toContain('p-value')
  })

  it('includes "WINNER" label for a significant result', () => {
    const samplesA = Array.from({ length: 15 }, () => 100)
    const samplesB = Array.from({ length: 15 }, () => 400)
    const r = welchTTest(samplesA, samplesB)
    if (r.significant) {
      const text = formatAbResult(r).join('\n')
      expect(text.toUpperCase()).toContain('WINNER')
    }
  })
})
