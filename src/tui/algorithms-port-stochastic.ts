/*!
 * DP / text / stochastic algorithm methods for AlgorithmsPort.
 * Extracted from algorithms-port.ts (SRP / 800-line limit).
 * Covers: knapsack, lcs, rodCutting, editDistance, activitySelect, huffman,
 *   rabinKarp, monteCarlo, bayesian, markov, flowEfficiency, queueSim,
 *   kalman, linearRegression, chiSquare, entropy, quickselect, cfd.
 */

import {
  knapsack01,
  longestCommonSubsequence,
  rodCutting,
  editDistance,
  activitySelection,
  huffmanCodes,
  rabinKarp,
} from '../core/algorithms/dynamic-programming.js'
import { suffixArray, suffixArraySearch } from '../core/algorithms/string/suffix-array.js'
import {
  monteCarlo,
  bayesianInference,
  markovChain,
  littlesLaw,
  mm1Queue,
  kalmanFilter,
  linearRegression,
  chiSquareTest,
  shannonEntropy,
  quickselect,
  cumulativeFlowDiagram,
} from '../core/algorithms/stochastic.js'
import type { AlgorithmHelpers } from './algorithms-port-helpers.js'
import type { AlgorithmsPort } from './algorithms-port.js'

type StochasticMethods = Pick<
  AlgorithmsPort,
  | 'knapsack'
  | 'lcs'
  | 'rodCutting'
  | 'editDistance'
  | 'activitySelect'
  | 'huffman'
  | 'rabinKarp'
  | 'suffixSearch'
  | 'monteCarlo'
  | 'bayesian'
  | 'markov'
  | 'flowEfficiency'
  | 'queueSim'
  | 'kalman'
  | 'linearRegression'
  | 'chiSquare'
  | 'entropy'
  | 'quickselect'
  | 'cfd'
>

export function makeStochasticMethods(h: AlgorithmHelpers): StochasticMethods {
  return {
    knapsack(capacity: string) {
      const cap = parseInt(capacity) || 10
      const { nodes } = h.getNodes()
      const items = nodes.slice(0, 20).map((n, i) => ({ value: 10 + (n.priority || 3) * 5, weight: 1 + (i % 5) }))
      const result = knapsack01(items, cap)
      return h.listResult('/knapsack', [
        `  Capacity: ${cap}`,
        `  Items available: ${items.length}`,
        `  Selected: ${result.selected.length}`,
        `  Total value: ${result.totalValue}`,
        `  Total weight: ${result.totalWeight}`,
      ])
    },

    lcs(a: string, b: string) {
      if (!a || !b) return 'Usage: /lcs <string1> <string2>'
      const result = longestCommonSubsequence(a, b)
      return h.listResult('/lcs', [`  Sequence: "${result.sequence}"`, `  Length: ${result.length}`])
    },

    rodCutting(length: string) {
      const n = parseInt(length) || 10
      const prices = [1, 5, 8, 9, 10, 17, 17, 20, 24, 30]
      const result = rodCutting(prices.slice(0, n), n)
      return h.listResult('/rod-cutting', [
        `  Length: ${n}`,
        `  Max revenue: ${result.maxRevenue}`,
        `  Cuts: ${result.cuts.join(', ')}`,
      ])
    },

    editDistance(a: string, b: string) {
      if (!a || !b) return 'Usage: /edit-distance <string1> <string2>'
      const result = editDistance(a, b)
      return h.listResult('/edit-distance', [
        `  Distance: ${result.distance}`,
        `  Operations: ${result.operations.slice(0, 20).join(', ')}`,
      ])
    },

    activitySelect() {
      const { nodes } = h.getNodes()
      const intervals = nodes.slice(0, 30).map((n, i) => ({ start: i, end: i + 1 + ((n.priority || 3) % 3) }))
      const result = activitySelection(intervals)
      return h.listResult('/activity-select', [
        `  Max activities: ${result.count}`,
        `  Selected: ${result.selected.join(', ')}`,
      ])
    },

    huffman() {
      const { nodes } = h.getNodes()
      const freq = new Map<string, number>()
      for (const n of nodes.slice(0, 20)) {
        const tag = n.tags?.[0] || 'task'
        freq.set(tag, (freq.get(tag) || 0) + 1)
      }
      const codes = huffmanCodes(freq)
      return h.listResult(
        '/huffman',
        Array.from(codes.entries())
          .sort((a, b) => freq.get(b[0])! - freq.get(a[0])!)
          .map(([char, code]) => `  "${char}" (${freq.get(char)}): ${code}`),
      )
    },

    rabinKarp(text: string, pattern: string) {
      if (!text || !pattern) return 'Usage: /rabin-karp <text> <pattern>'
      const matches = rabinKarp(text, pattern)
      return h.listResult(
        '/rabin-karp',
        matches.length === 0 ? ['  No matches found'] : [`  Pattern found at positions: ${matches.join(', ')}`],
      )
    },

    suffixSearch(text: string, pattern: string) {
      if (!text || !pattern) return 'Usage: /suffix-search <text> <pattern>'
      const position = suffixArraySearch(suffixArray(text), pattern)
      return h.listResult(
        '/suffix-search',
        position === -1 ? ['  No match found'] : [`  Pattern found at position: ${position}`],
      )
    },

    monteCarlo(trials: string) {
      const t = parseInt(trials) || 10000
      const { nodes } = h.getNodes()
      const activeTasks = nodes.filter((n) => n.status === 'in_progress' || n.status === 'ready')
      const result = monteCarlo(t, (_trial) =>
        activeTasks.reduce((sum, n) => sum + 1 + (Math.random() * (n.estimateMinutes || 60)) / 60, 0),
      )
      return h.listResult('/monte-carlo', [
        `  Trials: ${t}`,
        `  Mean: ${result.mean.toFixed(1)}h`,
        `  Median: ${result.median.toFixed(1)}h`,
        `  P75: ${result.p75.toFixed(1)}h`,
        `  P85: ${result.p85.toFixed(1)}h`,
        `  P95: ${result.p95.toFixed(1)}h`,
        `  Stddev: ${result.stddev.toFixed(2)}`,
      ])
    },

    bayesian(prior: string, likelihood: string, evidence: string) {
      const p = parseFloat(prior)
      const l = parseFloat(likelihood)
      const e = parseFloat(evidence)
      if (isNaN(p) || isNaN(l) || isNaN(e)) return 'Usage: /bayesian <prior> <likelihood> <evidence>'
      const result = bayesianInference(p, l, e)
      return h.listResult('/bayesian', [
        `  Prior: ${(result.prior * 100).toFixed(1)}%`,
        `  Posterior: ${(result.posterior * 100).toFixed(1)}%`,
        `  Likelihood ratio: ${result.evidence > 0 ? ((result.prior / result.evidence) * (result.prior / result.evidence)).toFixed(2) : 'N/A'}`,
      ])
    },

    markov(steps: string) {
      const s = parseInt(steps) || 10
      const { nodes } = h.getNodes()
      const statuses = ['backlog', 'ready', 'in_progress', 'blocked', 'done']
      const counts = statuses.map((st) => nodes.filter((n) => n.status === st).length)
      const total = counts.reduce((a, b) => a + b, 0) || 1
      const initialState = counts.map((c) => c / total)
      const tm = [
        [0.6, 0.2, 0.0, 0.0, 0.2],
        [0.0, 0.5, 0.3, 0.0, 0.2],
        [0.0, 0.0, 0.5, 0.1, 0.4],
        [0.0, 0.0, 0.3, 0.6, 0.1],
        [0.0, 0.0, 0.0, 0.0, 1.0],
      ]
      const result = markovChain(tm, initialState, s)
      const finalState = result.probabilities[result.probabilities.length - 1]
      return h.listResult('/markov', [
        `  Steps: ${s}`,
        `  Current: ${statuses.map((st, i) => `${st} ${(initialState[i] * 100).toFixed(1)}%`).join(', ')}`,
        `  After ${s} steps: ${statuses.map((st, i) => `${st} ${(finalState[i] * 100).toFixed(1)}%`).join(', ')}`,
        `  Steady state (done): ${(result.steadyState[4] * 100).toFixed(1)}%`,
      ])
    },

    flowEfficiency() {
      const { nodes } = h.getNodes()
      const _backlog = nodes.filter((n) => n.status === 'backlog').length
      const inProgress = nodes.filter((n) => n.status === 'in_progress').length
      const done = nodes.filter((n) => n.status === 'done').length
      const total = nodes.length
      const result = littlesLaw(inProgress || 1, Math.max(inProgress, done / Math.max(1, total)))
      return h.listResult('/flow-efficiency', [
        `  WIP: ${inProgress}`,
        `  Throughput: ${done}/${total} (${((done / Math.max(1, total)) * 100).toFixed(1)}%)`,
        `  Utilization: ${(result.utilization * 100).toFixed(1)}%`,
        `  Avg queue length: ${result.avgQueueLength.toFixed(2)}`,
        `  Avg wait: ${result.avgWait.toFixed(2)} steps`,
      ])
    },

    queueSim(arrival: string, service: string) {
      const a = parseFloat(arrival) || 1
      const s = parseFloat(service) || 2
      const result = mm1Queue(a, s)
      return h.listResult('/queue-sim', [
        `  M/M/1 Queue (λ=${a}, μ=${s})`,
        `  Utilization ρ: ${(result.utilization * 100).toFixed(1)}%`,
        `  Avg queue length: ${result.avgQueueLength.toFixed(2)}`,
        `  Avg wait: ${result.avgWait.toFixed(2)}`,
        `  Idle fraction: ${(result.idleFraction * 100).toFixed(1)}%`,
      ])
    },

    kalman(measurements: string) {
      const data = measurements
        ? measurements
            .split(',')
            .map(Number)
            .filter((n) => !isNaN(n))
        : []
      if (data.length < 2) return 'Usage: /kalman <val1,val2,...,valN> (at least 2 values)'
      const result = kalmanFilter(data)
      return h.listResult('/kalman', [
        `  Measurements: ${data.length}`,
        `  Raw (last 5): ${data
          .slice(-5)
          .map((v) => v.toFixed(1))
          .join(', ')}`,
        `  Filtered (last 5): ${result.filtered
          .slice(-5)
          .map((v) => v.toFixed(1))
          .join(', ')}`,
        `  Final variance: ${result.variance[result.variance.length - 1].toFixed(4)}`,
        `  Noise reduction: ${result.variance[0] > 0 ? ((1 - result.variance[result.variance.length - 1] / result.variance[0]) * 100).toFixed(1) : 'N/A'}%`,
      ])
    },

    linearRegression(args: string) {
      const { nodes } = h.getNodes()
      if (!args || args === 'velocity') {
        const done = nodes.filter((n) => n.status === 'done')
        const data: [number, number][] = done.map((n, i) => [i, (n.estimateMinutes || 60) / 60])
        if (data.length < 2) return 'Not enough done tasks for regression'
        const result = linearRegression(data)
        return h.listResult('/linear-reg', [
          `  Model: y = ${result.slope.toFixed(2)}x + ${result.intercept.toFixed(2)}`,
          `  R²: ${result.rSquared.toFixed(4)}`,
          `  Next task estimate: ${result.predict(data.length).toFixed(1)}h`,
        ])
      }
      return 'Usage: /linear-regression velocity'
    },

    chiSquare(observed: string, expected: string) {
      const obs = observed
        ? observed
            .split(',')
            .map(Number)
            .filter((n) => !isNaN(n))
        : []
      const exp = expected
        ? expected
            .split(',')
            .map(Number)
            .filter((n) => !isNaN(n))
        : []
      if (obs.length < 2) return 'Usage: /chi-square <val1,val2,...> [<expected1,...>]'
      const expectedArr = exp.length === obs.length ? exp : obs.map(() => obs.reduce((a, b) => a + b, 0) / obs.length)
      const result = chiSquareTest(obs, expectedArr)
      return h.listResult('/chi-square', [
        `  χ² = ${result.chiSquared.toFixed(4)}`,
        `  df = ${result.degreesOfFreedom}`,
        `  p-value = ${result.pValue.toFixed(4)}`,
        `  ${result.pValue < 0.05 ? '⚠ Significant difference detected' : '✓ No significant difference'}`,
      ])
    },

    entropy() {
      const { nodes } = h.getNodes()
      const statusCount = new Map<string, number>()
      for (const n of nodes) statusCount.set(n.status, (statusCount.get(n.status) || 0) + 1)
      const probs = Array.from(statusCount.values()).map((c) => c / nodes.length)
      const entropyVal = shannonEntropy(probs)
      const maxEntropy = Math.log2(statusCount.size)
      return h.listResult('/entropy', [
        `  Shannon entropy: ${entropyVal.toFixed(3)} bits`,
        `  Max entropy: ${maxEntropy.toFixed(3)} bits`,
        `  Relative entropy: ${maxEntropy > 0 ? ((entropyVal / maxEntropy) * 100).toFixed(1) : 'N/A'}%`,
        `  ${entropyVal < 0.5 * maxEntropy ? '🟢 Low uncertainty (predictable flow)' : entropyVal > 0.8 * maxEntropy ? '🔴 High uncertainty (chaotic flow)' : '🟡 Moderate uncertainty'}`,
      ])
    },

    quickselect(k: string) {
      const kth = parseInt(k) || 1
      const { nodes } = h.getNodes()
      const values = nodes.filter((n) => n.estimateMinutes).map((n) => n.estimateMinutes!)
      if (values.length === 0) return 'No tasks with estimates'
      const selected = quickselect(values, Math.min(kth, values.length) - 1)
      const sorted = [...values].sort((a, b) => a - b)
      return h.listResult('/quickselect', [
        `  ${kth}th smallest estimate: ${selected} min`,
        `  Array size: ${values.length}`,
        `  Min: ${sorted[0]} · Max: ${sorted[sorted.length - 1]}`,
        `  Median: ${quickselect(values, Math.floor(values.length / 2))}`,
      ])
    },

    cfd() {
      const { nodes } = h.getNodes()
      const history = [
        {
          date: new Date().toISOString().slice(0, 10),
          backlog: nodes.filter((n) => n.status === 'backlog').length,
          inProgress: nodes.filter((n) => n.status === 'in_progress' || n.status === 'ready' || n.status === 'blocked')
            .length,
          done: nodes.filter((n) => n.status === 'done').length,
        },
      ]
      const cfd = cumulativeFlowDiagram(history)
      const latest = cfd[cfd.length - 1]
      return h.listResult('/cfd', [
        `  Flow state (${latest.date}):`,
        `    Backlog: ${'█'.repeat(Math.min(latest.backlog, 40))} ${latest.backlog}`,
        `    Active:  ${'█'.repeat(Math.min(latest.inProgress, 40))} ${latest.inProgress}`,
        `    Done:    ${'█'.repeat(Math.min(latest.done, 40))} ${latest.done}`,
        `  Total: ${nodes.length}`,
      ])
    },
  }
}
