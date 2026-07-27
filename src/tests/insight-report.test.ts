import { describe, it, expect } from 'vitest'
import { rankGaps } from '../core/scan/insight-report.js'

const INSIGHT = {
  repo: 'my-repo',
  capability: 'caching',
  label: 'Cache Layer',
  insight: 'Add Redis cache',
  pillar: 'performance' as const,
  effort: 'medium' as const,
  impact: 'high' as const,
}

describe('rankGaps', () => {
  it('returns empty array for empty input', () => {
    expect(rankGaps([])).toEqual([])
  })

  it('returns one RankedGap per unique capability', () => {
    const result = rankGaps([INSIGHT])
    expect(result).toHaveLength(1)
    expect(result[0].capability).toBe('caching')
  })

  it('merges insights with same capability into one gap', () => {
    const i2 = { ...INSIGHT, repo: 'other-repo' }
    const result = rankGaps([INSIGHT, i2])
    expect(result).toHaveLength(1)
    expect(result[0].repos).toContain('my-repo')
    expect(result[0].repos).toContain('other-repo')
  })

  it('creates separate gaps for different capabilities', () => {
    const i2 = { ...INSIGHT, capability: 'auth', label: 'Auth Layer' }
    const result = rankGaps([INSIGHT, i2])
    expect(result).toHaveLength(2)
  })

  it('each gap has label and insight fields', () => {
    const [gap] = rankGaps([INSIGHT])
    expect(gap.label).toBe('Cache Layer')
    expect(gap.insight).toBe('Add Redis cache')
  })
})
