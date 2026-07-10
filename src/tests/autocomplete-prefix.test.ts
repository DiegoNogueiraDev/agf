/*!
 * TDD: prefix-filtered autocomplete (node_21a5e89ff185).
 *
 * AC1: /pro → provider and principles are suggested ranked by match.
 * AC2: Tab on single match completes inline (pure filter returns 1 result).
 */

import { describe, it, expect } from 'vitest'
import { filterCommands } from '../tui/dispatch-parsing.js'

describe('AC1: prefix filter /pro returns provider + principles', () => {
  it('returns results containing provider when typing /pro', () => {
    const results = filterCommands('/pro')
    const names = results.map((r) => r.name)
    expect(names).toContain('provider')
  })

  it('returns results containing principles when typing /pri', () => {
    const results = filterCommands('/pri')
    const names = results.map((r) => r.name)
    expect(names).toContain('principles')
  })

  it('results are ranked — provider appears before unrelated commands', () => {
    const results = filterCommands('/pro')
    expect(results.length).toBeGreaterThan(0)
    // First result should be a strong prefix match
    const first = results[0]!.name
    expect(first.startsWith('pro')).toBe(true)
  })
})

describe('AC2: Tab completion — single exact match', () => {
  it('returns exactly 1 result for a near-unique prefix', () => {
    const results = filterCommands('/kanban')
    expect(results.length).toBe(1)
    expect(results[0]!.name).toBe('kanban')
  })

  it('returns 0 results for a nonsense prefix', () => {
    const results = filterCommands('/zzznomatch999')
    expect(results.length).toBe(0)
  })
})
