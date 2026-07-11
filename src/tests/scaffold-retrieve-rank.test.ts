import { describe, it, expect } from 'vitest'
import { nodeRequirementText, rankScaffolds } from '../core/scaffolder/retrieve-rank.js'
import type { RankableNode } from '../core/scaffolder/retrieve-rank.js'

describe('nodeRequirementText', () => {
  it('joins title, description, tags, AC into lowercase string', () => {
    const node: RankableNode = {
      title: 'Auth Service',
      description: 'Handles authentication',
      tags: ['auth', 'security'],
      acceptanceCriteria: ['User can log in'],
    }
    const text = nodeRequirementText(node)
    expect(text).toContain('auth service')
    expect(text).toContain('handles authentication')
    expect(text).toContain('auth')
    expect(text).toContain('user can log in')
  })

  it('handles missing optional fields', () => {
    const node: RankableNode = { title: 'Simple Task' }
    const text = nodeRequirementText(node)
    expect(text).toContain('simple task')
  })
})

describe('rankScaffolds', () => {
  it('returns an array', () => {
    const node: RankableNode = { title: 'build cli typescript project' }
    const ranked = rankScaffolds(node)
    expect(Array.isArray(ranked)).toBe(true)
  })

  it('returns only scaffolds with score > 0', () => {
    const node: RankableNode = { title: 'random unrelated query zzz' }
    const ranked = rankScaffolds(node)
    for (const r of ranked) {
      expect(r.score).toBeGreaterThan(0)
    }
  })

  it('results are in descending score order', () => {
    const node: RankableNode = { title: 'cli typescript commander vitest build test' }
    const ranked = rankScaffolds(node)
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score)
    }
  })
})
