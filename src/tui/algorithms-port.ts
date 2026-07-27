/*!
 * AlgorithmsPort — bridges SqliteStore to the TUI algorithm views.
 *
 * WHY: Keeps the TUI dispatch layer thin; all algorithm implementations are
 * extracted into focused sub-modules (SRP) to stay under 800 lines each:
 *   algorithms-port-graph.ts       — graph traversal (17 methods)
 *   algorithms-port-stochastic.ts  — DP / text / stochastic (18 methods)
 *   algorithms-port-optimization.ts— scheduling / optimization (11 methods)
 */

import { createLogger } from '../core/utils/logger.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'
import type { AlgorithmHelpers } from './algorithms-port-helpers.js'
import { makeGraphMethods } from './algorithms-port-graph.js'
import { makeStochasticMethods } from './algorithms-port-stochastic.js'
import { makeOptimizationMethods } from './algorithms-port-optimization.js'

export interface AlgorithmsPort {
  topologicalSort(): string
  topologicalSortDfs(): string
  criticalPath(): string
  dijkstra(source: string, target?: string): string
  bellmanFord(source: string): string
  floydWarshall(): string
  scc(): string
  bfs(source: string): string
  dfs(source: string): string
  mst(): string
  maxFlow(source: string, sink: string): string
  hungarian(costMatrix?: string): string
  pageRank(): string
  centrality(): string
  graphMetrics(): string
  articulationPoints(): string
  bridges(): string
  knapsack(capacity: string): string
  lcs(a: string, b: string): string
  rodCutting(length: string): string
  editDistance(a: string, b: string): string
  activitySelect(): string
  huffman(): string
  rabinKarp(text: string, pattern: string): string
  suffixSearch(text: string, pattern: string): string
  monteCarlo(trials: string): string
  bayesian(prior: string, likelihood: string, evidence: string): string
  markov(steps: string): string
  flowEfficiency(): string
  queueSim(arrival: string, service: string): string
  kalman(measurements: string): string
  linearRegression(args: string): string
  chiSquare(observed: string, expected: string): string
  entropy(): string
  quickselect(k: string): string
  cfd(): string
  cluster(k: string): string
  gradientDescent(): string
  weightedMajority(): string
  setCover(): string
  tsp(): string
  vertexCover(): string
  geneticTask(population: string, generations: string): string
  branchBound(costMatrix?: string): string
  backtrack(): string
  linearProgram(): string
  seasonality(period: string): string
}

const log = createLogger({ layer: 'cli', source: 'tui/algorithms-port.ts' })

/** Creates an AlgorithmsPort adapter that bridges the SqliteStore to the TUI algorithm views. */
export function makeAlgorithmsPort(store: SqliteStore, _allNodes?: string[]): AlgorithmsPort {
  log.debug('making algorithms port')

  const getNodes = () => {
    const doc = store.toGraphDocument()
    return { nodes: doc.nodes, edges: doc.edges }
  }

  const listResult = (title: string, lines: string[]): string => {
    const border = '═'.repeat(Math.min(60, title.length + 4))
    return [`┌${border}┐`, `│ ${title} │`, `└${border}┘`, ...lines].join('\n')
  }

  const helpers: AlgorithmHelpers = {
    getNodes,
    listResult,
    getTaskIds: () => getNodes().nodes.map((n) => n.id),
  }

  return {
    ...makeGraphMethods(helpers),
    ...makeStochasticMethods(helpers),
    ...makeOptimizationMethods(helpers),
  }
}
