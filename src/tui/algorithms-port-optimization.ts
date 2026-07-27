/*!
 * Optimization / scheduling algorithm methods for AlgorithmsPort.
 * Extracted from algorithms-port.ts (SRP / 800-line limit).
 * Covers: cluster, gradientDescent, weightedMajority, setCover, tsp,
 *   vertexCover, geneticTask, branchBound, backtrack, linearProgram, seasonality.
 */

import {
  kmeansClustering,
  gradientDescent,
  multiplicativeWeights,
  setCover,
  tspNearestNeighbor,
  vertexCoverApprox,
  geneticAlgorithm,
  branchAndBound,
  backtrackingSolver,
  linearProgramming,
} from '../core/algorithms/optimization.js'
import { seasonalityDecompose } from '../core/algorithms/stochastic.js'
import type { AlgorithmHelpers } from './algorithms-port-helpers.js'
import type { AlgorithmsPort } from './algorithms-port.js'

type OptimizationMethods = Pick<
  AlgorithmsPort,
  | 'cluster'
  | 'gradientDescent'
  | 'weightedMajority'
  | 'setCover'
  | 'tsp'
  | 'vertexCover'
  | 'geneticTask'
  | 'branchBound'
  | 'backtrack'
  | 'linearProgram'
  | 'seasonality'
>

export function makeOptimizationMethods(h: AlgorithmHelpers): OptimizationMethods {
  return {
    cluster(k: string) {
      const kk = parseInt(k) || 3
      const { nodes } = h.getNodes()
      const data = nodes
        .slice(0, 50)
        .filter((n) => n.estimateMinutes)
        .map((n) => [n.priority || 3, (n.estimateMinutes || 60) / 60])
      if (data.length < kk) return 'Not enough data points for clustering'
      const result = kmeansClustering(data, kk)
      return h.listResult('/cluster', [
        `  K: ${kk}`,
        `  Data points: ${data.length}`,
        `  Clusters: ${result.clusters.map((c, i) => `Cluster ${i}: ${c.length} items`).join(', ')}`,
        `  Centroids: ${result.centroids.map((c, i) => `C${i}=[${c.map((v) => v.toFixed(1)).join(',')}]`).join(', ')}`,
      ])
    },

    gradientDescent() {
      const { nodes } = h.getNodes()
      const avgEffort =
        nodes.filter((n) => n.estimateMinutes).reduce((s, n) => s + (n.estimateMinutes || 0), 0) /
        Math.max(1, nodes.length)
      const costFn = (p: number[]) => (p[0] - avgEffort / 60) ** 2
      const gradientFn = (p: number[]) => [2 * (p[0] - avgEffort / 60)]
      const result = gradientDescent({ costFn, gradientFn, initialParams: [10], learningRate: 0.01, iterations: 100 })
      return h.listResult('/gradient-descent', [
        `  Initial: 10 → Final: ${result.params[0].toFixed(2)}`,
        `  Iterations: ${result.costHistory.length}`,
        `  Initial cost: ${result.costHistory[0].toFixed(2)}`,
        `  Final cost: ${result.costHistory[result.costHistory.length - 1].toFixed(2)}`,
      ])
    },

    weightedMajority() {
      const { nodes } = h.getNodes()
      const experts = nodes.filter((n) => n.status === 'done').slice(0, 5)
      const payoffs = experts.map(() => Array.from({ length: 20 }, () => (Math.random() > 0.4 ? 1 : 0)))
      const result = multiplicativeWeights(payoffs)
      return h.listResult('/weighted-majority', [
        `  Experts: ${experts.length}`,
        `  Best expert: #${result.bestExpert + 1}`,
        `  Regret: ${result.regret.toFixed(4)}`,
        `  Weights: ${result.weights.map((w) => w.toFixed(3)).join(', ')}`,
      ])
    },

    setCover() {
      const { nodes } = h.getNodes()
      const universe = nodes.map((n) => n.id)
      const subsets = new Map<string, string[]>()
      for (const n of nodes.slice(0, 10)) {
        subsets.set(n.id, universe.slice(0, Math.min(universe.length, 3 + (n.priority || 3))))
      }
      const result = setCover(universe, subsets)
      return h.listResult('/set-cover', [
        `  Universe size: ${universe.length}`,
        `  Subsets: ${subsets.size}`,
        `  Selected: ${result.selected.length}`,
        `  Cover: ${((result.covered / universe.length) * 100).toFixed(1)}%`,
      ])
    },

    tsp() {
      const { nodes } = h.getNodes()
      const cities: [number, number][] = nodes
        .slice(0, 15)
        .map((n) => [(n.priority || 3) * 10 + Math.random() * 5, (n.estimateMinutes || 60) / 6 + Math.random() * 5])
      const result = tspNearestNeighbor(cities)
      return h.listResult('/tsp', [
        `  Cities: ${cities.length}`,
        `  Route distance: ${result.distance.toFixed(1)}`,
        `  Route: ${result.route.join(' → ')}`,
      ])
    },

    vertexCover() {
      const { nodes, edges } = h.getNodes()
      const edgePairs: [number, number][] = edges.slice(0, 30).map((e, i) => {
        const u = nodes.findIndex((n) => n.id === e.from)
        const v = nodes.findIndex((n) => n.id === e.to)
        return [u >= 0 ? u : i, v >= 0 ? v : (i + 1) % nodes.length] as [number, number]
      })
      const result = vertexCoverApprox(edgePairs)
      return h.listResult('/vertex-cover', [
        `  Edges: ${edgePairs.length}`,
        `  Vertex cover size: ${result.size}`,
        `  Vertices: ${Array.from(result.vertices).join(', ')}`,
      ])
    },

    geneticTask(population: string, generations: string) {
      const pop = parseInt(population) || 50
      const gen = parseInt(generations) || 30
      const { nodes } = h.getNodes()
      const tasks = nodes
        .filter((n) => n.status !== 'done')
        .slice(0, 20)
        .map((n) => ({ id: n.id, effort: (n.estimateMinutes || 60) / 60, value: (6 - (n.priority || 3)) * 10 }))
      const maxEffort = tasks.reduce((s, t) => s + t.effort, 0) * 0.6
      const result = geneticAlgorithm({ tasks, maxEffort, populationSize: pop, generations: gen })
      return h.listResult('/genetic', [
        `  Tasks available: ${tasks.length}`,
        `  Max effort: ${maxEffort.toFixed(1)}h`,
        `  Selected: ${result.schedule.length}`,
        `  Total value: ${result.totalValue}`,
        `  Generation: ${result.generation}`,
      ])
    },

    branchBound(costMatrix?: string) {
      if (costMatrix) {
        const rows = costMatrix.split(';').map((r) => r.trim().split(',').map(Number))
        const result = branchAndBound(rows)
        return h.listResult('/branch-bound', [
          `  Total cost: ${result.totalCost}`,
          `  Nodes visited: ${result.nodesVisited}`,
          `  Assignments: ${result.assignment.map(([r, c]) => `T${r}→A${c}`).join(', ')}`,
        ])
      }
      const { nodes } = h.getNodes()
      const size = Math.min(nodes.length, 5)
      const mock: number[][] = Array.from({ length: size }, () =>
        Array.from({ length: size }, () => Math.floor(Math.random() * 10) + 1),
      )
      const result = branchAndBound(mock)
      return h.listResult('/branch-bound', [
        `  Size: ${size}x${size}`,
        `  Optimal cost: ${result.totalCost}`,
        `  Nodes visited: ${result.nodesVisited}`,
      ])
    },

    backtrack() {
      const { nodes } = h.getNodes()
      const vars = nodes.slice(0, 5).map((n) => n.id)
      const domains = new Map<string, unknown[]>()
      for (const v of vars) domains.set(v, ['backlog', 'ready', 'in_progress', 'done'])
      const constraints = [(a: Map<string, unknown>) => a.get(vars[0]) !== 'backlog' || a.get(vars[1]) !== 'done']
      const result = backtrackingSolver({ variables: vars, domains, constraints })
      return h.listResult('/backtrack', [
        `  Variables: ${vars.length}`,
        `  Domains: ${domains.size}`,
        `  Backtracks: ${result.backtracks}`,
        result.solution
          ? `  Solution found: ${Array.from(result.solution.entries())
              .map(([k, v]) => `${k}=${v}`)
              .join(', ')}`
          : '  No solution found',
      ])
    },

    linearProgram() {
      const { nodes } = h.getNodes()
      const tasks = nodes.filter((n) => n.status !== 'done').slice(0, 5)
      const c = tasks.map((n) => n.priority || 3)
      const A = [tasks.map((n) => (n.estimateMinutes || 60) / 60)]
      const totalEffort = A[0].reduce((s, v) => s + v, 0) * 0.5
      const result = linearProgramming({ c, A, b: [totalEffort] })
      return h.listResult(
        '/linear-program',
        [
          `  Variables: ${tasks.length}`,
          `  Constraints: ${A.length}`,
          `  Feasible: ${result.feasible ? 'Yes' : 'No'}`,
          `  Optimal value: ${result.optimalValue.toFixed(2)}`,
          result.x.length > 0
            ? `  Solution: ${result.x.map((v, i) => `${tasks[i].id}=${v.toFixed(2)}`).join(', ')}`
            : '',
        ].filter(Boolean),
      )
    },

    seasonality(period: string) {
      const p = parseInt(period) || 7
      const { nodes } = h.getNodes()
      const series = nodes
        .filter((n) => n.status === 'done')
        .slice(0, 30)
        .map((_, i) => 5 + Math.sin((i * 2 * Math.PI) / (p || 7)) * 3 + Math.random() * 2)
      const result = seasonalityDecompose(series, p)
      return h.listResult('/seasonality', [
        `  Period: ${p}`,
        `  Data points: ${series.length}`,
        `  Trend (first/last): ${result.trend[0]?.toFixed(1)} → ${result.trend[result.trend.length - 1]?.toFixed(1)}`,
        `  Seasonal (avg): ${(result.seasonal.reduce((a, b) => a + Math.abs(b), 0) / result.seasonal.length).toFixed(2)}`,
      ])
    },
  }
}
