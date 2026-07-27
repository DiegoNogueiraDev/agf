import { describe, it, expect } from 'vitest'
import { computeRetentionScore, classifyTier } from '../core/economy/retention.js'

describe('computeRetentionScore', () => {
  it('returns original score at age 0', () => {
    expect(computeRetentionScore(1.0, 0)).toBeCloseTo(1.0)
  })

  it('decays over time', () => {
    const score30 = computeRetentionScore(1.0, 30)
    expect(score30).toBeLessThan(1.0)
    expect(score30).toBeGreaterThan(0)
  })

  it('higher lambda decays faster', () => {
    const fast = computeRetentionScore(1.0, 10, { lambda: 0.1, sigma: 0.3 })
    const slow = computeRetentionScore(1.0, 10, { lambda: 0.01, sigma: 0.3 })
    expect(fast).toBeLessThan(slow)
  })

  it('never goes negative', () => {
    expect(computeRetentionScore(0.5, 100_000)).toBeGreaterThanOrEqual(0)
  })

  it('scales linearly with originalScore', () => {
    const a = computeRetentionScore(0.5, 10)
    const b = computeRetentionScore(1.0, 10)
    expect(b / a).toBeCloseTo(2.0, 5)
  })
})

describe('classifyTier', () => {
  it('classifies hot above threshold', () => {
    expect(classifyTier(0.8)).toBe('hot')
    expect(classifyTier(1.0)).toBe('hot')
  })

  it('classifies warm', () => {
    expect(classifyTier(0.5)).toBe('warm')
    expect(classifyTier(0.69)).toBe('warm')
  })

  it('classifies cold', () => {
    expect(classifyTier(0.2)).toBe('cold')
    expect(classifyTier(0.39)).toBe('cold')
  })

  it('classifies expired below cold threshold', () => {
    expect(classifyTier(0.1)).toBe('expired')
    expect(classifyTier(0)).toBe('expired')
  })

  it('respects custom thresholds', () => {
    const thresholds = { hot: 0.9, warm: 0.5, cold: 0.2 }
    expect(classifyTier(0.8, thresholds)).toBe('warm')
    expect(classifyTier(0.95, thresholds)).toBe('hot')
    expect(classifyTier(0.3, thresholds)).toBe('cold')
    expect(classifyTier(0.1, thresholds)).toBe('expired')
  })
})
