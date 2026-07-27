import { describe, it, expect } from 'vitest'
import { formatQualityTrend } from '../core/harness/quality-snapshot.js'

const SNAPSHOT = {
  ts: '2026-06-23T00:00:00.000Z',
  harnessScore: 88,
  harnessGrade: 'A',
  testScore: 78,
  logScore: 95,
  totalModules: 1399,
}

describe('formatQualityTrend', () => {
  it('returns a string', () => {
    const result = formatQualityTrend({
      current: SNAPSHOT,
      previous: null,
      harnessDelta: null,
      testDelta: null,
      logDelta: null,
      severity: 'stable',
      alerts: [],
    })
    expect(typeof result).toBe('string')
  })

  it('includes the harness score in the output', () => {
    const result = formatQualityTrend({
      current: SNAPSHOT,
      previous: null,
      harnessDelta: null,
      testDelta: null,
      logDelta: null,
      severity: 'stable',
      alerts: [],
    })
    expect(result).toContain('88')
  })

  it('mentions baseline when no previous snapshot', () => {
    const result = formatQualityTrend({
      current: SNAPSHOT,
      previous: null,
      harnessDelta: null,
      testDelta: null,
      logDelta: null,
      severity: 'stable',
      alerts: [],
    })
    expect(result).toContain('baseline')
  })

  it('shows delta info when previous snapshot exists', () => {
    const result = formatQualityTrend({
      current: SNAPSHOT,
      previous: { ...SNAPSHOT, harnessScore: 85, ts: '2026-06-22T00:00:00.000Z' },
      harnessDelta: 3,
      testDelta: 1,
      logDelta: 0,
      severity: 'improving',
      alerts: [],
    })
    expect(result).toContain('Delta')
  })

  it('includes test score percentage', () => {
    const result = formatQualityTrend({
      current: SNAPSHOT,
      previous: null,
      harnessDelta: null,
      testDelta: null,
      logDelta: null,
      severity: 'stable',
      alerts: [],
    })
    expect(result).toContain('78%')
  })
})
