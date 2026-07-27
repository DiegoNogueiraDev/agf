import { describe, it, expect } from 'vitest'
import { mineScaffoldCandidates } from '../core/rag-out/mining.js'

describe('mineScaffoldCandidates', () => {
  it('returns empty for no goals', () => {
    expect(mineScaffoldCandidates([])).toHaveLength(0)
  })

  it('returns empty when no cluster meets minFrequency', () => {
    const goals = ['generate prd for product', 'write test suite']
    const result = mineScaffoldCandidates(goals, { minFrequency: 3 })
    expect(result).toHaveLength(0)
  })

  it('clusters similar goals and returns candidate', () => {
    const goals = ['generate prd for product launch', 'generate prd for product roadmap']
    const result = mineScaffoldCandidates(goals, { minFrequency: 2, similarity: 0.3 })
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]?.count).toBeGreaterThanOrEqual(2)
  })

  it('candidate has suggestedId, fitTags, count, examples', () => {
    const goals = ['scaffold test file for service', 'scaffold test file for module']
    const result = mineScaffoldCandidates(goals, { minFrequency: 2, similarity: 0.3 })
    if (result.length > 0) {
      const c = result[0]!
      expect(typeof c.suggestedId).toBe('string')
      expect(Array.isArray(c.fitTags)).toBe(true)
      expect(c.count).toBeGreaterThanOrEqual(2)
      expect(c.examples.length).toBeGreaterThan(0)
    }
  })

  it('filters stopwords from fitTags', () => {
    const goals = ['create a plan for the project', 'create a plan for the module']
    const result = mineScaffoldCandidates(goals, { minFrequency: 2, similarity: 0.3 })
    if (result.length > 0) {
      const tags = result[0]!.fitTags
      expect(tags).not.toContain('a')
      expect(tags).not.toContain('the')
    }
  })
})
