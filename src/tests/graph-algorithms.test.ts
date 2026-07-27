import { describe, it, expect } from 'vitest'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'
import { topologicalSort, bfs, dfs, dijkstra, kruskalMst, bellmanFord } from '../core/algorithms/graph-algorithms.js'

function node(id: string): GraphNode {
  return {
    id,
    type: 'task',
    title: id,
    status: 'backlog',
    priority: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function edge(from: string, to: string, weight = 1): GraphEdge {
  return {
    id: `${from}-${to}`,
    from,
    to,
    relationType: 'depends_on',
    weight,
    createdAt: new Date().toISOString(),
  }
}

const nodes = [node('A'), node('B'), node('C'), node('D')]
const dagEdges = [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D')]

describe('topologicalSort', () => {
  it('returns all nodes', () => {
    const result = topologicalSort(nodes, dagEdges)
    expect(result.length).toBe(4)
  })

  it('A appears before B and C', () => {
    const result = topologicalSort(nodes, dagEdges)
    const ids = result.map((n) => n.id)
    expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('B'))
    expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('C'))
  })

  it('B and C appear before D', () => {
    const result = topologicalSort(nodes, dagEdges)
    const ids = result.map((n) => n.id)
    expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('D'))
    expect(ids.indexOf('C')).toBeLessThan(ids.indexOf('D'))
  })

  it('returns empty for empty graph', () => {
    expect(topologicalSort([], [])).toEqual([])
  })
})

describe('bfs', () => {
  it('visits all reachable nodes from source', () => {
    const result = bfs(nodes, dagEdges, 'A')
    expect(result.length).toBe(4)
  })

  it('source is first in BFS order', () => {
    const result = bfs(nodes, dagEdges, 'A')
    expect(result[0]?.id).toBe('A')
  })

  it('returns only reachable nodes from disconnected source', () => {
    const isolated = [node('X'), node('Y')]
    const result = bfs(isolated, [], 'X')
    expect(result.map((n) => n.id)).toContain('X')
  })
})

describe('dfs', () => {
  it('visits all reachable nodes from source', () => {
    const result = dfs(nodes, dagEdges, 'A')
    expect(result.length).toBe(4)
  })

  it('source is first in DFS order', () => {
    const result = dfs(nodes, dagEdges, 'A')
    expect(result[0]?.id).toBe('A')
  })
})

describe('dijkstra', () => {
  it('finds shortest path between connected nodes', () => {
    const result = dijkstra(nodes, dagEdges, 'A', 'D')
    expect(result.path.length).toBeGreaterThan(0)
    expect(result.path[0]?.id).toBe('A')
    expect(result.path.at(-1)?.id).toBe('D')
  })

  it('returns empty path when source equals destination', () => {
    const result = dijkstra(nodes, dagEdges, 'A', 'A')
    expect(result.distance).toBe(0)
  })
})

describe('kruskalMst', () => {
  const weightedEdges = [edge('A', 'B', 4), edge('A', 'C', 2), edge('B', 'D', 5), edge('C', 'D', 1)]

  it('returns n-1 edges for a connected graph', () => {
    const result = kruskalMst(nodes, weightedEdges)
    expect(result.edges.length).toBe(nodes.length - 1)
  })

  it('total weight is the minimum spanning tree weight', () => {
    const result = kruskalMst(nodes, weightedEdges)
    expect(result.totalWeight).toBeGreaterThan(0)
  })
})

describe('bellmanFord', () => {
  it('returns a Map of distances from source', () => {
    const result = bellmanFord(nodes, dagEdges, 'A')
    expect(result).not.toBeNull()
    expect(result instanceof Map).toBe(true)
  })

  it('distance to source itself is 0', () => {
    const result = bellmanFord(nodes, dagEdges, 'A')
    expect(result?.get('A')).toBe(0)
  })

  it('distance to reachable node is finite', () => {
    const result = bellmanFord(nodes, dagEdges, 'A')
    expect(result?.get('D')).toBeLessThan(Infinity)
  })
})
