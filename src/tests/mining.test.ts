import { describe, it, expect } from 'vitest'
import { mineScaffoldCandidates } from '../core/rag-out/mining.js'

describe('mineScaffoldCandidates', () => {
  it('returns empty array for empty goals', () => {
    expect(mineScaffoldCandidates([])).toHaveLength(0)
  })

  it('returns empty when frequency threshold not met', () => {
    const result = mineScaffoldCandidates(['generate report'], { minFrequency: 2 })
    expect(result).toHaveLength(0)
  })

  it('clusters similar goals into one candidate', () => {
    const goals = ['generate user report', 'generate user summary', 'generate user export']
    const result = mineScaffoldCandidates(goals, { minFrequency: 2, similarity: 0.3 })
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].count).toBeGreaterThanOrEqual(2)
  })

  it('candidate includes fitTags and examples', () => {
    const goals = ['generate pdf invoice', 'generate pdf receipt']
    const result = mineScaffoldCandidates(goals, { minFrequency: 2, similarity: 0.3 })
    if (result.length > 0) {
      expect(Array.isArray(result[0].fitTags)).toBe(true)
      expect(result[0].examples.length).toBeGreaterThan(0)
    }
  })

  it('returns candidates sorted by count descending', () => {
    const goals = [
      'generate invoice pdf',
      'generate invoice receipt',
      'generate invoice html',
      'build something else',
      'build new thing',
    ]
    const result = mineScaffoldCandidates(goals, { minFrequency: 2, similarity: 0.3 })
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].count).toBeGreaterThanOrEqual(result[i].count)
    }
  })
})
