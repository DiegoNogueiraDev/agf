/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Thin wrapper over already-tested core/algorithms/optimization.ts and
 * stochastic.ts. Covers the wrapper's own logic (edge cases, formatting),
 * not the algorithms themselves.
 */
import { describe, it, expect } from 'vitest'
import { makeOptimizationMethods } from '../tui/algorithms-port-optimization.js'
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

describe('makeOptimizationMethods', () => {
  it('cluster: reports insufficient data when fewer points than k', () => {
    const methods = makeOptimizationMethods(makeHelpers([node('a', { estimateMinutes: 60 })]))
    expect(methods.cluster('3')).toBe('Not enough data points for clustering')
  })

  it('cluster: defaults k to 3 on an invalid argument', () => {
    const nodes = Array.from({ length: 5 }, (_, i) => node(`n${i}`, { estimateMinutes: 60 }))
    const methods = makeOptimizationMethods(makeHelpers(nodes))
    const result = methods.cluster('not-a-number')
    expect(result).toContain('K: 3')
  })

  it('gradientDescent: converges and reports final cost', () => {
    const nodes = [node('a', { estimateMinutes: 120 })]
    const methods = makeOptimizationMethods(makeHelpers(nodes))
    const result = methods.gradientDescent()
    expect(result).toContain('/gradient-descent')
    expect(result).toContain('Iterations: 100')
  })

  it('setCover: reports universe size and coverage percentage', () => {
    const nodes = [node('a'), node('b'), node('c')]
    const methods = makeOptimizationMethods(makeHelpers(nodes))
    const result = methods.setCover()
    expect(result).toContain('Universe size: 3')
    expect(result).toContain('Cover:')
  })

  it('backtrack/tsp/vertexCover: delegate without throwing on a small graph', () => {
    const nodes = [node('a'), node('b')]
    const methods = makeOptimizationMethods(makeHelpers(nodes))
    expect(() => methods.backtrack()).not.toThrow()
    expect(() => methods.tsp()).not.toThrow()
    expect(() => methods.vertexCover()).not.toThrow()
  })
})
