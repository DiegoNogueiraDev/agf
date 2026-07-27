/*!
 * TDD: brute-force warning in selectByActivation (node_08a4d8c42b91).
 *
 * AC1: Given a recall selecting >50% of corpus ≥20, When runs, Then result has
 *      warning 'index-brute-force'.
 * AC2: Given selective recall (<50%), When runs, Then no warning (byte-identical).
 */

import { describe, it, expect } from 'vitest'
import { selectByActivation, computeIndexHonesty, type ScoredMemory } from '../core/memory/memory-salience.js'

const NOW = 1000000

function makeScoredMemory(id: string, activation: number): ScoredMemory {
  return {
    activation,
    tokens: 10,
    result: {
      id,
      content: `content of ${id}`,
      type: 'user',
      createdAt: new Date(NOW - 1000).toISOString(),
      updatedAt: new Date(NOW - 1000).toISOString(),
      supersededBy: null,
      validUntil: null,
    },
  }
}

function makeCorpus(size: number): ScoredMemory[] {
  return Array.from({ length: size }, (_, i) => makeScoredMemory(`m${i}`, 10 - i * 0.1))
}

describe('computeIndexHonesty', () => {
  it('returns bruteForce=true when selected > 50% of corpus >= 20', () => {
    expect(computeIndexHonesty({ selected: 15, corpusSize: 20 }).bruteForce).toBe(true)
  })

  it('returns bruteForce=false when selected <= 50%', () => {
    expect(computeIndexHonesty({ selected: 5, corpusSize: 20 }).bruteForce).toBe(false)
  })

  it('returns bruteForce=false when corpus < 20 (small corpus exempt)', () => {
    expect(computeIndexHonesty({ selected: 15, corpusSize: 19 }).bruteForce).toBe(false)
  })
})

describe('AC1: warning attached when brute-force detected', () => {
  it('selectByActivation adds warning when >50% of ≥20 corpus selected', () => {
    const corpus = makeCorpus(20)
    // Limit high enough to keep >10 items (>50%)
    const result = selectByActivation(corpus, { limit: 15, nowMs: NOW, corpusSize: 20 })
    expect(result.warning).toBe('index-brute-force')
  })
})

describe('AC2: no warning when recall is selective (<50%)', () => {
  it('selectByActivation has no warning when selecting <=50%', () => {
    const corpus = makeCorpus(20)
    const result = selectByActivation(corpus, { limit: 5, nowMs: NOW, corpusSize: 20 })
    expect(result.warning).toBeUndefined()
  })

  it('no warning when corpus size < 20 (backward-compatible)', () => {
    const corpus = makeCorpus(10)
    const result = selectByActivation(corpus, { limit: 10, nowMs: NOW })
    expect(result.warning).toBeUndefined()
  })
})
