/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { buildRepoMap, type RepoMapSymbol, type RepoMapRelation } from '../core/context/repo-map.js'

// Two heavily-referenced hubs + a long tail of low-value leaves ⇒ a sharp drop in
// PageRank, so the marginal-value rule has a clear "patch edge" to leave at.
function fixture(): { symbols: RepoMapSymbol[]; relations: RepoMapRelation[] } {
  const symbols: RepoMapSymbol[] = [
    { id: 'hubA', name: 'hubA', file: 'a.ts', startLine: 1, signature: 'function hubA()', exported: true },
    { id: 'hubB', name: 'hubB', file: 'b.ts', startLine: 1, signature: 'function hubB()', exported: true },
  ]
  const relations: RepoMapRelation[] = []
  for (let i = 0; i < 12; i++) {
    const id = `leaf${i}`
    symbols.push({ id, name: id, file: `${id}.ts`, startLine: 1, signature: `function ${id}()`, exported: false })
    relations.push({ fromSymbol: id, toSymbol: 'hubA' }, { fromSymbol: id, toSymbol: 'hubB' })
  }
  return { symbols, relations }
}

describe('repo-map forage_stop (Charnov MVT patch-leaving over ranked symbols)', () => {
  const input = fixture()
  const budget = { tokenBudget: 100_000, focus: 'hub' } // large ⇒ budget alone includes everything

  it('lever OFF is byte-identical to the legacy budget-only map', () => {
    const off = buildRepoMap(input, budget)
    const explicitFalse = buildRepoMap(input, { ...budget, forageStop: false })
    expect(off.text).toBe(explicitFalse.text)
    expect(off.forageSavedTokens).toBe(0)
    // With a generous budget, every symbol is included.
    expect(off.included).toBe(input.symbols.length)
  })

  it('lever ON stops earlier, keeping the high-value head and saving tokens', () => {
    const off = buildRepoMap(input, budget)
    const on = buildRepoMap(input, { ...budget, forageStop: true })
    expect(on.included).toBeLessThan(off.included)
    expect(on.forageSavedTokens).toBeGreaterThan(0)
    // The hubs (highest PageRank) survive the cut.
    expect(on.text).toContain('hubA')
    expect(on.text).toContain('hubB')
  })

  it('respects the budget as a hard ceiling (never includes more than budget-only)', () => {
    const tight = { tokenBudget: 60, focus: 'hub' }
    const off = buildRepoMap(input, tight)
    const on = buildRepoMap(input, { ...tight, forageStop: true })
    expect(on.included).toBeLessThanOrEqual(off.included)
  })
})
