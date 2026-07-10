import { describe, it, expect } from 'vitest'
import { mineScaffoldCandidates } from '../core/rag-out/mining.js'

describe('mineScaffoldCandidates', () => {
  const goals = [
    'create a REST endpoint handler for users',
    'create a REST endpoint handler for orders',
    'create a REST endpoint handler for products',
    'compute a pricing formula with discounts',
    'compute a pricing formula with taxes',
    'draft a one-off marketing haiku',
  ]

  it('promotes recurring goals into scaffold candidates above the frequency floor', () => {
    const cands = mineScaffoldCandidates(goals, { minFrequency: 2 })
    // the REST cluster (3) and the pricing-formula cluster (2) qualify
    expect(cands.length).toBe(2)
    const rest = cands.find((c) => c.fitTags.includes('rest'))
    expect(rest).toBeDefined()
    expect(rest!.count).toBe(3)
  })

  it('derives fitTags from the tokens common to the cluster', () => {
    const cands = mineScaffoldCandidates(goals, { minFrequency: 2 })
    const rest = cands.find((c) => c.fitTags.includes('rest'))!
    expect(rest.fitTags).toEqual(expect.arrayContaining(['rest', 'endpoint', 'handler']))
    // the varying tail (users/orders/products) is NOT a shared tag
    expect(rest.fitTags).not.toContain('users')
  })

  it('excludes one-off goals (below the floor)', () => {
    const cands = mineScaffoldCandidates(goals, { minFrequency: 2 })
    expect(cands.some((c) => c.examples.some((e) => e.includes('haiku')))).toBe(false)
  })

  it('respects a higher frequency floor', () => {
    const cands = mineScaffoldCandidates(goals, { minFrequency: 3 })
    expect(cands.length).toBe(1) // only the REST cluster has 3
  })

  it('returns no candidates for empty history', () => {
    expect(mineScaffoldCandidates([], { minFrequency: 2 })).toEqual([])
  })

  it('carries examples for human review before promotion', () => {
    const cands = mineScaffoldCandidates(goals, { minFrequency: 2 })
    const rest = cands.find((c) => c.fitTags.includes('rest'))!
    expect(rest.examples.length).toBeGreaterThan(0)
    expect(rest.suggestedId).toBeTruthy()
  })
})
