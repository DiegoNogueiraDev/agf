/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Thin wrapper over already-tested core/algorithms/dynamic-programming.ts
 * and stochastic.ts. Covers the wrapper's own logic (edge cases,
 * formatting), not the algorithms themselves.
 */
import { describe, it, expect } from 'vitest'
import { makeStochasticMethods } from '../tui/algorithms-port-stochastic.js'
import type { AlgorithmHelpers } from '../tui/algorithms-port-helpers.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function makeHelpers(nodes: GraphNode[]): AlgorithmHelpers {
  return {
    getNodes: () => ({ nodes, edges: [] }),
    listResult: (title, lines) => [title, ...lines].join('\n'),
    getTaskIds: () => nodes.map((n) => n.id),
  }
}

function node(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return { id, title: id, type: 'task', status: 'backlog', priority: 3, createdAt: '', updatedAt: '', ...overrides }
}

describe('makeStochasticMethods', () => {
  it('lcs: requires both string arguments', () => {
    const methods = makeStochasticMethods(makeHelpers([]))
    expect(methods.lcs('', 'b')).toBe('Usage: /lcs <string1> <string2>')
    expect(methods.lcs('a', '')).toBe('Usage: /lcs <string1> <string2>')
  })

  it('lcs: reports the common subsequence and its length', () => {
    const methods = makeStochasticMethods(makeHelpers([]))
    const result = methods.lcs('ABCBDAB', 'BDCABA')
    expect(result).toContain('/lcs')
    expect(result).toContain('Length:')
  })

  it('editDistance: requires both string arguments', () => {
    const methods = makeStochasticMethods(makeHelpers([]))
    expect(methods.editDistance('', 'b')).toBe('Usage: /edit-distance <string1> <string2>')
  })

  it('knapsack: defaults capacity to 10 on an invalid argument', () => {
    const nodes = [node('a', { priority: 5 })]
    const methods = makeStochasticMethods(makeHelpers(nodes))
    expect(methods.knapsack('not-a-number')).toContain('Capacity: 10')
  })

  it('entropy/cfd: delegate without throwing on empty input', () => {
    const methods = makeStochasticMethods(makeHelpers([]))
    expect(() => methods.entropy()).not.toThrow()
    expect(() => methods.cfd()).not.toThrow()
  })

  it('suffixSearch: requires both text and pattern arguments', () => {
    const methods = makeStochasticMethods(makeHelpers([]))
    expect(methods.suffixSearch('', 'pattern')).toBe('Usage: /suffix-search <text> <pattern>')
    expect(methods.suffixSearch('text', '')).toBe('Usage: /suffix-search <text> <pattern>')
  })

  it('suffixSearch: finds a literal match in mixed-case text (regression: locale vs ordinal comparator mismatch)', () => {
    const methods = makeStochasticMethods(makeHelpers([]))
    const text = 'Apple apple Apple apple banana Cherry cherry'
    const result = methods.suffixSearch(text, 'banana')
    expect(result).toContain(`Pattern found at position: ${text.indexOf('banana')}`)
  })

  it('suffixSearch: reports no match for an absent pattern', () => {
    const methods = makeStochasticMethods(makeHelpers([]))
    expect(methods.suffixSearch('line one\nline two', 'missing')).toContain('No match found')
  })
})
