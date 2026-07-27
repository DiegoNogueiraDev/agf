import { describe, it, expect } from 'vitest'
import { scoreFriction, scoreOptimality, scoreReversibility } from '../core/designer/decision-fitness.js'
import type { Jtbd } from '../core/designer/decision-fitness.js'

type GraphNode = Parameters<typeof scoreFriction>[0]

function makeNode(description: string): GraphNode {
  return { id: 'n1', title: 'Test Decision', description, type: 'decision' } as any
}

describe('scoreFriction', () => {
  it('returns score 100 for clean description', () => {
    const result = scoreFriction(makeNode('Use simple, standard approach'))
    expect(result.score).toBe(100)
    expect(result.detectedKeywords).toHaveLength(0)
  })

  it('reduces score for friction keywords', () => {
    const result = scoreFriction(makeNode('configuration required and manual setup needed'))
    expect(result.score).toBeLessThan(100)
    expect(result.detectedKeywords.length).toBeGreaterThan(0)
  })

  it('score never goes below 0', () => {
    const manyKeywords = 'configuration required manual setup required setup required configuration required'
    const result = scoreFriction(makeNode(manyKeywords))
    expect(result.score).toBeGreaterThanOrEqual(0)
  })

  it('returns justification string', () => {
    const result = scoreFriction(makeNode('clean description'))
    expect(typeof result.justification).toBe('string')
    expect(result.justification.length).toBeGreaterThan(0)
  })
})

describe('scoreOptimality', () => {
  it('returns score 100 when no JTBDs provided', () => {
    const result = scoreOptimality(makeNode('any decision'), [])
    expect(result.score).toBe(100)
    expect(result.matchedJtbds).toHaveLength(0)
    expect(result.unmatchedJtbds).toHaveLength(0)
  })

  it('has score between 0 and 100', () => {
    const jtbds: Jtbd[] = [
      { situation: 'dev', motivation: 'faster deployment', outcome: 'reduced time', sourceNodeId: 'n1' },
    ]
    const result = scoreOptimality(makeNode('use deployment pipeline to reduce build time'), jtbds)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })
})

describe('scoreReversibility', () => {
  it('returns result with score and keyword lists', () => {
    const result = scoreReversibility(makeNode('use vendor-neutral approach'))
    expect(typeof result.score).toBe('number')
    expect(Array.isArray(result.lockInKeywords)).toBe(true)
    expect(Array.isArray(result.reversibleKeywords)).toBe(true)
  })

  it('score is between 0 and 100', () => {
    const result = scoreReversibility(makeNode('any description'))
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })
})
