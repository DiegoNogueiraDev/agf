import { describe, it, expect } from 'vitest'
import { checkCiGate } from '../core/evals/eval-compare.js'

const baseQuality = { passes: true, total: 10, aboveThreshold: 8, passRate: 0.8, avgScore: 0.85 }

describe('checkCiGate', () => {
  it('passes when quality is above threshold and cost has not regressed', () => {
    const result = checkCiGate(100, baseQuality, 100, {
      maxCostRegressionPct: 10,
      minQualityScore: 0.8,
      minQualityPassRate: 0.7,
    })
    expect(result.passes).toBe(true)
    expect(result.failReasons).toHaveLength(0)
  })

  it('fails when cost regresses by more than 10%', () => {
    const result = checkCiGate(115, baseQuality, 100, {
      maxCostRegressionPct: 10,
      minQualityScore: 0.8,
      minQualityPassRate: 0.7,
    })
    expect(result.passes).toBe(false)
    expect(result.failReasons.some((r) => r.includes('cost'))).toBe(true)
  })

  it('does not fail on cost when regression is exactly 10% (boundary)', () => {
    const result = checkCiGate(110, baseQuality, 100, {
      maxCostRegressionPct: 10,
      minQualityScore: 0.8,
      minQualityPassRate: 0.7,
    })
    expect(result.passes).toBe(true)
    expect(result.costRegressionPct).toBeCloseTo(10, 5)
  })

  it('fails when quality pass rate is below 70%', () => {
    const badQuality = { passes: false, total: 10, aboveThreshold: 5, passRate: 0.5, avgScore: 0.72 }
    const result = checkCiGate(100, badQuality, 100, {
      maxCostRegressionPct: 10,
      minQualityScore: 0.8,
      minQualityPassRate: 0.7,
    })
    expect(result.passes).toBe(false)
    expect(result.failReasons.some((r) => r.includes('quality'))).toBe(true)
  })

  it('reports the axis that regressed in failReasons (quality)', () => {
    const badQuality = { passes: false, total: 10, aboveThreshold: 5, passRate: 0.5, avgScore: 0.65 }
    const result = checkCiGate(100, badQuality, 100, {
      maxCostRegressionPct: 10,
      minQualityScore: 0.8,
      minQualityPassRate: 0.7,
    })
    const reasons = result.failReasons.join(' ')
    expect(reasons).toMatch(/quality|score/i)
  })

  it('passes when there is no baseline (first run — no regression possible)', () => {
    const result = checkCiGate(9999, baseQuality, null, {
      maxCostRegressionPct: 10,
      minQualityScore: 0.8,
      minQualityPassRate: 0.7,
    })
    expect(result.passes).toBe(true)
    expect(result.costRegressionPct).toBeNull()
  })

  it('fails on both axes and reports both in failReasons', () => {
    const badQuality = { passes: false, total: 5, aboveThreshold: 2, passRate: 0.4, avgScore: 0.6 }
    const result = checkCiGate(200, badQuality, 100, {
      maxCostRegressionPct: 10,
      minQualityScore: 0.8,
      minQualityPassRate: 0.7,
    })
    expect(result.passes).toBe(false)
    expect(result.failReasons.length).toBeGreaterThanOrEqual(2)
  })

  it('costRegressionPct is (current - baseline) / baseline * 100', () => {
    const result = checkCiGate(120, baseQuality, 100, {
      maxCostRegressionPct: 10,
      minQualityScore: 0.8,
      minQualityPassRate: 0.7,
    })
    expect(result.costRegressionPct).toBeCloseTo(20, 5)
  })

  it('passes when quality zero scenarios — no data is not a failure', () => {
    const emptyQuality = { passes: false, total: 0, aboveThreshold: 0, passRate: 0, avgScore: 0 }
    const result = checkCiGate(100, emptyQuality, 100, {
      maxCostRegressionPct: 10,
      minQualityScore: 0.8,
      minQualityPassRate: 0.7,
    })
    // No scenarios = no data = can't fail on quality
    expect(result.passes).toBe(true)
  })
})
