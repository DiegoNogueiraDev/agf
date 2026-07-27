/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Thin wrapper over already-tested core/algorithms/graph-algorithms.ts
 * (see graph-algorithms.test.ts). Covers the wrapper's own logic — empty
 * input handling, usage messages, and delegation — not the algorithms
 * themselves.
 */
import { describe, it, expect } from 'vitest'
import { makeGraphMethods } from '../tui/algorithms-port-graph.js'
import type { AlgorithmHelpers } from '../tui/algorithms-port-helpers.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

function makeHelpers(nodes: GraphNode[], edges: GraphEdge[]): AlgorithmHelpers {
  return {
    getNodes: () => ({ nodes, edges }),
    listResult: (title, lines) => [title, ...lines].join('\n'),
    getTaskIds: () => nodes.map((n) => n.id),
  }
}

function node(id: string, title: string): GraphNode {
  return { id, title, type: 'task', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' }
}

describe('makeGraphMethods', () => {
  it('topologicalSort: lists nodes in order for an acyclic graph', () => {
    const nodes = [node('a', 'A'), node('b', 'B')]
    const edges: GraphEdge[] = [{ id: 'e1', from: 'a', to: 'b', relationType: 'depends_on', createdAt: '' }]
    const methods = makeGraphMethods(makeHelpers(nodes, edges))
    const result = methods.topologicalSort()
    expect(result).toContain('/topological-sort')
    expect(result).toContain('A')
  })

  it('dijkstra: requires a source argument', () => {
    const methods = makeGraphMethods(makeHelpers([], []))
    expect(methods.dijkstra('')).toBe('Usage: /dijkstra <sourceId> [targetId]')
  })

  it('dijkstra: reports no path when the target is unreachable', () => {
    const nodes = [node('a', 'A'), node('b', 'B')]
    const methods = makeGraphMethods(makeHelpers(nodes, []))
    expect(methods.dijkstra('a', 'b')).toContain('No path from a to b')
  })

  it('criticalPath: reports no path found for an empty graph', () => {
    const methods = makeGraphMethods(makeHelpers([], []))
    expect(methods.criticalPath()).toContain('No critical path found')
  })

  it('bfs/dfs: delegate to the underlying algorithm and format via listResult', () => {
    const nodes = [node('a', 'A')]
    const methods = makeGraphMethods(makeHelpers(nodes, []))
    expect(methods.bfs('a')).toContain('/bfs')
    expect(methods.dfs('a')).toContain('/dfs')
  })
})
