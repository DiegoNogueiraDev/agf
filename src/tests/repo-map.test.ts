/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { buildRepoMap } from '../core/context/repo-map.js'

describe('repo-map', () => {
  const symbols = [
    {
      id: 's1',
      name: 'handleRequest',
      file: 'src/server.ts',
      startLine: 10,
      signature: 'handleRequest(req: Request)',
      exported: true,
    },
    {
      id: 's2',
      name: 'validateInput',
      file: 'src/validation.ts',
      startLine: 5,
      signature: 'validateInput(data: unknown)',
      exported: true,
    },
    { id: 's3', name: 'helper', file: 'src/utils.ts', startLine: 20, signature: 'helper()', exported: false },
  ]

  const relations = [
    { fromSymbol: 's1', toSymbol: 's2' },
    { fromSymbol: 's1', toSymbol: 's3' },
  ]

  it('returns empty result for empty symbols', () => {
    const result = buildRepoMap({ symbols: [], relations: [] }, { tokenBudget: 1000 })
    expect(result.text).toBe('')
    expect(result.included).toBe(0)
  })

  it('returns a non-empty map with symbols', () => {
    const result = buildRepoMap({ symbols, relations }, { tokenBudget: 500 })
    expect(result.text).toBeTruthy()
    expect(result.text).toContain('Repo-map')
    expect(result.included).toBeGreaterThan(0)
    expect(result.tokensEstimated).toBeGreaterThan(0)
  })

  it('respects token budget', () => {
    const result = buildRepoMap({ symbols, relations }, { tokenBudget: 10 })
    expect(result.included).toBeLessThanOrEqual(symbols.length)
  })

  it('boosts focus symbol ranking', () => {
    const result = buildRepoMap({ symbols, relations }, { tokenBudget: 200, focus: 'handleRequest' })
    expect(result.text).toContain('handleRequest')
  })

  it('formats symbols as file:line signature', () => {
    const result = buildRepoMap({ symbols, relations }, { tokenBudget: 1000 })
    expect(result.text).toContain('src/server.ts:10')
    expect(result.text).toContain('handleRequest')
  })

  describe('zipf_estimate calibrated budget (opt-in)', () => {
    it('estimates the budget with chars/4 by default (charsPerToken undefined)', () => {
      const result = buildRepoMap({ symbols, relations }, { tokenBudget: 1000 })
      // Default path: tokensEstimated ≈ ceil(textLength / 4).
      expect(result.tokensEstimated).toBe(Math.ceil(result.text.length / 4))
    })

    it('uses the calibrated chars/token ratio when provided', () => {
      const def = buildRepoMap({ symbols, relations }, { tokenBudget: 1000 })
      // A larger ratio ⇒ fewer estimated tokens for the same text (chars/8 < chars/4).
      const cal = buildRepoMap({ symbols, relations }, { tokenBudget: 1000, charsPerToken: 8 })
      expect(cal.tokensEstimated).toBe(Math.ceil(cal.text.length / 8))
      expect(cal.tokensEstimated).toBeLessThan(def.tokensEstimated)
    })
  })

  describe('heat_kernel ranker (opt-in)', () => {
    it('uses PageRank by default (rankSource=pagerank, byte-identical)', () => {
      const result = buildRepoMap({ symbols, relations }, { tokenBudget: 500, focus: 'handleRequest' })
      expect(result.rankSource).toBe('pagerank')
    })

    it('diffuses from the focus seed when ranker=heat_kernel', () => {
      const result = buildRepoMap(
        { symbols, relations },
        { tokenBudget: 500, focus: 'handleRequest', ranker: 'heat_kernel' },
      )
      expect(result.rankSource).toBe('heat_kernel')
      expect(result.text).toContain('handleRequest')
    })

    it('falls back to PageRank when no focus symbol matches the seed', () => {
      const result = buildRepoMap(
        { symbols, relations },
        { tokenBudget: 500, focus: 'no-such-symbol', ranker: 'heat_kernel' },
      )
      expect(result.rankSource).toBe('pagerank')
    })

    it('falls back to PageRank when ranker=heat_kernel but no focus given', () => {
      const result = buildRepoMap({ symbols, relations }, { tokenBudget: 500, ranker: 'heat_kernel' })
      expect(result.rankSource).toBe('pagerank')
    })
  })
})
