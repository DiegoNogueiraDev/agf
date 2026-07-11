/*!
 * Graph-traversal algorithm methods for AlgorithmsPort.
 * Extracted from algorithms-port.ts (SRP / 800-line limit).
 * Covers: topologicalSort, criticalPath, dijkstra, bellmanFord, floydWarshall,
 *   scc, bfs, dfs, mst, maxFlow, hungarian, pageRank, centrality, graphMetrics,
 *   articulationPoints, bridges.
 */

import {
  topologicalSort,
  topologicalSortDfs,
  criticalPath,
  dijkstra,
  bellmanFord,
  floydWarshall,
  tarjanScc,
  bfs,
  dfs,
  kruskalMst,
  fordFulkerson,
  hungarian,
  pageRank,
  betweennessCentrality,
  closenessCentrality,
  degreeCentrality,
  articulationPoints,
  bridges,
  graphDensity,
  graphDiameter,
} from '../core/algorithms/graph-algorithms.js'
import type { AlgorithmHelpers } from './algorithms-port-helpers.js'
import type { AlgorithmsPort } from './algorithms-port.js'

type GraphMethods = Pick<
  AlgorithmsPort,
  | 'topologicalSort'
  | 'topologicalSortDfs'
  | 'criticalPath'
  | 'dijkstra'
  | 'bellmanFord'
  | 'floydWarshall'
  | 'scc'
  | 'bfs'
  | 'dfs'
  | 'mst'
  | 'maxFlow'
  | 'hungarian'
  | 'pageRank'
  | 'centrality'
  | 'graphMetrics'
  | 'articulationPoints'
  | 'bridges'
>

export function makeGraphMethods(h: AlgorithmHelpers): GraphMethods {
  return {
    topologicalSort() {
      const { nodes, edges } = h.getNodes()
      const sorted = topologicalSort(nodes, edges)
      if (sorted.length === 0) return 'Graph has a cycle — topological sort impossible.'
      return h.listResult(
        '/topological-sort',
        sorted.map((n, i) => `  ${i + 1}. ${n.title} [${n.id}]`),
      )
    },

    topologicalSortDfs() {
      const { nodes, edges } = h.getNodes()
      const sorted = topologicalSortDfs(nodes, edges)
      if (sorted.length === 0) return 'Graph has a cycle — topological sort impossible.'
      return h.listResult(
        '/topological-sort-dfs',
        sorted.map((n, i) => `  ${i + 1}. ${n.title} [${n.id}]`),
      )
    },

    criticalPath() {
      const { nodes, edges } = h.getNodes()
      const cp = criticalPath(nodes, edges)
      if (cp.path.length === 0) return 'No critical path found (graph may have a cycle).'
      return h.listResult('/critical-path', [
        `  Duration: ${cp.totalDuration}`,
        `  Path: ${cp.path.map((n) => n.title).join(' → ')}`,
      ])
    },

    dijkstra(source: string, target?: string) {
      const { nodes, edges } = h.getNodes()
      if (!source) return 'Usage: /dijkstra <sourceId> [targetId]'
      const result = dijkstra(nodes, edges, source, target)
      if (!result) return `No path from ${source} to ${target || 'unknown node'}`
      return h.listResult('/dijkstra', [
        `  Distance: ${result.distance}`,
        `  Path: ${result.path.map((n) => n.title).join(' → ')}`,
      ])
    },

    bellmanFord(source: string) {
      const { nodes, edges } = h.getNodes()
      if (!source) return 'Usage: /bellman-ford <sourceId>'
      const dist = bellmanFord(nodes, edges, source)
      if (dist === null) return 'Negative cycle detected! Bellman-Ford cannot converge.'
      const entries = Array.from(dist.entries())
        .filter(([_, d]) => d !== Infinity)
        .sort((a, b) => a[1] - b[1])
      return h.listResult(
        '/bellman-ford',
        entries.map(([id, d]) => `  ${id}: ${d}`),
      )
    },

    floydWarshall() {
      const { nodes, edges } = h.getNodes()
      const dist = floydWarshall(nodes, edges)
      if (!dist) return 'No distance matrix computed.'
      const ids = h.getTaskIds().slice(0, 20)
      return h.listResult(
        '/floyd-warshall',
        ids.map(
          (u) =>
            `  ${u}: ${ids
              .map((v) => {
                const d = dist.get(u)?.get(v)
                return d === Infinity ? '∞' : d
              })
              .join(', ')}`,
        ),
      )
    },

    scc() {
      const { nodes, edges } = h.getNodes()
      const components = tarjanScc(nodes, edges)
      return h.listResult(
        '/scc',
        components.map((c, i) => `  SCC ${i + 1}: ${c.map((n) => n.title).join(', ')}`),
      )
    },

    bfs(source: string) {
      const { nodes, edges } = h.getNodes()
      if (!source) return 'Usage: /bfs <nodeId>'
      const order = bfs(nodes, edges, source)
      return h.listResult(
        '/bfs',
        order.map((n, i) => `  ${i}: ${n.title}`),
      )
    },

    dfs(source: string) {
      const { nodes, edges } = h.getNodes()
      if (!source) return 'Usage: /dfs <nodeId>'
      const order = dfs(nodes, edges, source)
      return h.listResult(
        '/dfs',
        order.map((n, i) => `  ${i}: ${n.title}`),
      )
    },

    mst() {
      const { nodes, edges } = h.getNodes()
      const kruskal = kruskalMst(nodes, edges)
      return h.listResult('/mst', [
        `  Kruskal total weight: ${kruskal.totalWeight}`,
        `  Edges: ${kruskal.edges.length}`,
        ...kruskal.edges.map((e) => `    ${e.from} → ${e.to} (w: ${e.weight ?? 1})`),
      ])
    },

    maxFlow(source: string, sink: string) {
      const { nodes, edges } = h.getNodes()
      if (!source || !sink) return 'Usage: /max-flow <sourceId> <sinkId>'
      const flow = fordFulkerson(nodes, edges, source, sink)
      return h.listResult('/max-flow', [`  Source: ${source}`, `  Sink: ${sink}`, `  Max flow: ${flow}`])
    },

    hungarian(costMatrix?: string) {
      if (costMatrix) {
        const rows = costMatrix.split(';').map((r) => r.trim().split(',').map(Number))
        const result = hungarian(rows)
        return h.listResult('/hungarian', [
          `  Total cost: ${result.totalCost}`,
          `  Assignments: ${result.assignment.map(([r, c]) => `row${r}→col${c}`).join(', ')}`,
        ])
      }
      const { nodes, edges } = h.getNodes()
      return h.listResult('/hungarian (quick)', [
        `  ${nodes.length} nodes, ${edges.length} edges`,
        '  Provide cost matrix: "/hungarian 4,1,3;2,0,5;3,2,2"',
      ])
    },

    pageRank() {
      const { nodes, edges } = h.getNodes()
      const pr = pageRank(nodes, edges)
      const sorted = Array.from(pr.entries()).sort((a, b) => b[1] - a[1])
      return h.listResult(
        '/page-rank',
        sorted.slice(0, 20).map(([id, r]) => `  ${id}: ${(r * 100).toFixed(2)}%`),
      )
    },

    centrality() {
      const { nodes, edges } = h.getNodes()
      const bc = betweennessCentrality(nodes, edges)
      const cl = closenessCentrality(nodes, edges)
      const _dc = degreeCentrality(nodes, edges)
      const sortedBc = Array.from(bc.entries()).sort((a, b) => b[1] - a[1])
      return h.listResult('/centrality', [
        '  Betweenness Centrality:',
        ...sortedBc.slice(0, 10).map(([id, v]) => `    ${id}: ${v.toFixed(4)}`),
        '  Closeness Centrality:',
        ...Array.from(cl.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([id, v]) => `    ${id}: ${v.toFixed(4)}`),
      ])
    },

    graphMetrics() {
      const { nodes, edges } = h.getNodes()
      const density = graphDensity(nodes, edges)
      const diam = graphDiameter(nodes, edges)
      return h.listResult('/graph-metrics', [
        `  Nodes: ${nodes.length}`,
        `  Edges: ${edges.length}`,
        `  Density: ${density.toFixed(4)}`,
        `  Diameter: ${diam === Infinity ? '∞' : diam}`,
        `  Avg degree: ${((2 * edges.length) / Math.max(1, nodes.length)).toFixed(2)}`,
      ])
    },

    articulationPoints() {
      const { nodes, edges } = h.getNodes()
      const aps = articulationPoints(nodes, edges)
      return h.listResult(
        '/articulation-points',
        aps.length === 0 ? ['  No articulation points found'] : aps.map((n) => `  ${n.title} [${n.id}]`),
      )
    },

    bridges() {
      const { nodes, edges } = h.getNodes()
      const br = bridges(nodes, edges)
      return h.listResult('/bridges', br.length === 0 ? ['  No bridges found'] : br.map((e) => `  ${e.from} → ${e.to}`))
    },
  }
}
