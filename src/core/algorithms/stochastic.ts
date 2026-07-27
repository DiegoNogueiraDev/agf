/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Stochastic and statistical algorithms.
 * Pure functions — no side effects, no dependencies.
 */
import { McpGraphError } from '../utils/errors.js'

// ── Helper functions ──────────────────────────────────────────────────────

function logGamma(z: number): number {
  const g = 7
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z)
  }
  z -= 1
  let x = c[0]
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i)
  }
  const t = z + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

function lowerRegularizedGamma(a: number, x: number): number {
  if (x === 0) return 0
  if (a === 0) return 1
  if (x < 0 || a <= 0) return 0
  let sum = 1 / a
  let term = 1 / a
  for (let n = 1; n < 400; n++) {
    term *= x / (a + n)
    sum += term
    if (Math.abs(term) <= Math.abs(sum) * 1e-14) break
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a))
}

/** Factorial of a non-negative integer. */
export function factorial(n: number): number {
  if (n > 20) throw new RangeError(`factorial: n must be ≤ 20 to avoid integer overflow (got ${n})`)
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

// Log-space Erlang-C computation for M/M/c queues with c > 20 (avoids factorial overflow)
function logSpaceMmc(c: number, crho: number, rho: number): { P0: number; Lq: number } {
  const lCrho = crho > 0 ? Math.log(crho) : -Infinity
  const terms: number[] = []
  let maxLog = -Infinity
  for (let k = 0; k < c; k++) {
    const lt = k * lCrho - logGamma(k + 1)
    terms.push(lt)
    if (lt > maxLog) maxLog = lt
  }
  const logLastTerm = c * lCrho - logGamma(c + 1) - Math.log(1 - rho)
  if (logLastTerm > maxLog) maxLog = logLastTerm

  let sumExp = terms.reduce((acc, lt) => acc + Math.exp(lt - maxLog), 0)
  sumExp += Math.exp(logLastTerm - maxLog)
  const logTotal = maxLog + Math.log(sumExp)

  const P0 = Math.exp(-logTotal)
  const logLq = -logTotal + c * lCrho + Math.log(rho) - logGamma(c + 1) - 2 * Math.log(1 - rho)
  return { P0, Lq: Math.exp(logLq) }
}

// ── monteCarlo ────────────────────────────────────────────────────────────

/** Monte Carlo estimation by averaging repeated random samples. */
export function monteCarlo(
  trials: number,
  estimateFn: (trial: number) => number,
): {
  mean: number
  median: number
  p75: number
  p85: number
  p95: number
  stddev: number
  distribution: number[]
} {
  const raw: number[] = []
  for (let t = 0; t < trials; t++) {
    raw.push(estimateFn(t))
  }
  const sorted = raw.slice().sort((a, b) => a - b)

  const sum = raw.reduce((s, v) => s + v, 0)
  const mean = sum / trials

  let sumSq = 0
  for (const v of raw) sumSq += (v - mean) ** 2
  const stddev = Math.sqrt(sumSq / trials)

  const idx = (p: number) => Math.min(Math.floor(p * trials), trials - 1)
  return {
    mean,
    median: sorted[idx(0.5)],
    p75: sorted[idx(0.75)],
    p85: sorted[idx(0.85)],
    p95: sorted[idx(0.95)],
    stddev,
    distribution: sorted,
  }
}

// ── bayesianInference ─────────────────────────────────────────────────────

/** Posterior probability via Bayes' theorem from prior and likelihoods. */
export function bayesianInference(
  prior: number,
  likelihood: number,
  evidence: number,
): { posterior: number; prior: number; evidence: number } {
  const posterior = evidence !== 0 ? (likelihood * prior) / evidence : 0
  return { posterior, prior, evidence }
}

// ── markovChain ───────────────────────────────────────────────────────────

/** Steady-state distribution of a Markov chain via repeated transition application. */
export function markovChain(
  transitionMatrix: number[][],
  initialState: number[],
  steps: number,
): { probabilities: number[][]; steadyState: number[] } {
  const n = transitionMatrix.length
  const probabilities: number[][] = [initialState.slice()]
  let current = initialState.slice()

  for (let step = 0; step < steps; step++) {
    const next = new Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        next[j] += current[i] * transitionMatrix[i][j]
      }
    }
    current = next
    probabilities.push(current.slice())
  }

  return { probabilities, steadyState: current }
}

// ── littlesLaw ────────────────────────────────────────────────────────────

/** Little's Law relationship between WIP, throughput, and cycle time (L = λW). */
export function littlesLaw(
  arrivalRate: number,
  serviceRate: number,
  servers = 1,
): {
  avgWait: number
  avgQueueLength: number
  utilization: number
  throughput: number
} {
  const c = servers
  const rho = arrivalRate / (c * serviceRate)

  if (rho >= 1) {
    return {
      avgWait: Infinity,
      avgQueueLength: Infinity,
      utilization: 1,
      throughput: c * serviceRate,
    }
  }

  if (c === 1) {
    const Lq = (rho * rho) / (1 - rho)
    const W = 1 / (serviceRate - arrivalRate)
    return { avgWait: W, avgQueueLength: Lq, utilization: rho, throughput: arrivalRate }
  }

  const crho = c * rho
  let Lq: number

  if (c > 20) {
    // Use log-space to avoid factorial overflow for large server counts
    ;({ Lq } = logSpaceMmc(c, crho, rho))
  } else {
    let sum = 0
    for (let k = 0; k < c; k++) {
      sum += crho ** k / factorial(k)
    }
    const lastTerm = crho ** c / (factorial(c) * (1 - rho))
    const p0 = 1 / (sum + lastTerm)
    Lq = (p0 * crho ** c * rho) / (factorial(c) * (1 - rho) ** 2)
  }

  const Wq = Lq / arrivalRate
  const W = Wq + 1 / serviceRate

  return { avgWait: W, avgQueueLength: Lq, utilization: rho, throughput: arrivalRate }
}

// ── mm1Queue ──────────────────────────────────────────────────────────────

/** M/M/1 queue metrics (utilization, queue length, wait time) from arrival/service rates. */
export function mm1Queue(
  arrivalRate: number,
  serviceRate: number,
  _timeHorizon?: number,
): {
  avgQueueLength: number
  avgWait: number
  utilization: number
  idleFraction: number
} {
  const rho = arrivalRate / serviceRate

  if (rho >= 1) {
    return { avgQueueLength: Infinity, avgWait: Infinity, utilization: 1, idleFraction: 0 }
  }

  const Lq = (rho * rho) / (1 - rho)
  const W = 1 / (serviceRate - arrivalRate)

  return {
    avgQueueLength: Lq,
    avgWait: W,
    utilization: rho,
    idleFraction: 1 - rho,
  }
}

// ── kalmanFilter ──────────────────────────────────────────────────────────

/** One-dimensional Kalman filter update fusing a prediction with a noisy measurement. */
export function kalmanFilter(
  measurements: number[],
  options?: { R?: number; Q?: number },
): {
  filtered: number[]
  variance: number[]
  gain: number[]
} {
  const R = options?.R ?? 1
  if (R <= 0) throw new RangeError(`kalmanFilter: measurement noise R must be positive (got ${R})`)
  const Q = options?.Q ?? 0.1
  const filtered: number[] = []
  const variance: number[] = []
  const gain: number[] = []

  let x = 0
  let P = 1

  for (const z of measurements) {
    const P_pred = P + Q
    const K = P_pred / (P_pred + R)
    x = x + K * (z - x)
    P = (1 - K) * P_pred

    filtered.push(x)
    variance.push(P)
    gain.push(K)
  }

  return { filtered, variance, gain }
}

// ── linearRegression ──────────────────────────────────────────────────────

/** Ordinary least-squares linear regression (slope, intercept, R²). */
export function linearRegression(data: [number, number][]): {
  slope: number
  intercept: number
  rSquared: number
  predict: (x: number) => number
} {
  const n = data.length
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumX2 = 0

  for (const [x, y] of data) {
    sumX += x
    sumY += y
    sumXY += x * y
    sumX2 += x * x
  }

  const xMean = sumX / n
  const yMean = sumY / n
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const intercept = yMean - slope * xMean

  let ssRes = 0
  let ssTot = 0
  for (const [x, y] of data) {
    const yPred = slope * x + intercept
    ssRes += (y - yPred) ** 2
    ssTot += (y - yMean) ** 2
  }
  const rSquared = ssTot !== 0 ? 1 - ssRes / ssTot : 0

  return {
    slope,
    intercept,
    rSquared,
    predict: (x: number) => slope * x + intercept,
  }
}

// ── chiSquareTest ─────────────────────────────────────────────────────────

/** Chi-square goodness-of-fit statistic between observed and expected frequencies. */
export function chiSquareTest(
  observed: number[],
  expected: number[],
): {
  chiSquared: number
  pValue: number
  degreesOfFreedom: number
} {
  if (observed.length !== expected.length) {
    throw new McpGraphError('observed and expected must have the same length')
  }

  const df = observed.length - 1
  let chiSquared = 0
  for (let i = 0; i < observed.length; i++) {
    if (expected[i] > 0) {
      chiSquared += (observed[i] - expected[i]) ** 2 / expected[i]
    }
  }

  const pValue = 1 - lowerRegularizedGamma(df / 2, chiSquared / 2)

  return { chiSquared, pValue, degreesOfFreedom: df }
}

// ── shannonEntropy ────────────────────────────────────────────────────────

/** Shannon entropy (in bits) of a discrete probability distribution. */
export function shannonEntropy(probabilities: number[]): number {
  let H = 0
  for (const p of probabilities) {
    if (p > 0) {
      H -= p * Math.log2(p)
    }
  }
  return H
}

// ── quickselect ───────────────────────────────────────────────────────────

/** k-th smallest element via quickselect partitioning (average O(n)). */
export function quickselect(arr: number[], k: number): number {
  const a = arr.slice()
  let left = 0
  let right = a.length - 1

  while (left < right) {
    // Random pivot guarantees O(n) expected time on any input (including sorted arrays)
    const pivotIndex = left + Math.floor(Math.random() * (right - left + 1))
    const pivotValue = a[pivotIndex]
    ;[a[pivotIndex], a[right]] = [a[right], a[pivotIndex]]
    let storeIndex = left
    for (let i = left; i < right; i++) {
      if (a[i] < pivotValue) {
        ;[a[storeIndex], a[i]] = [a[i], a[storeIndex]]
        storeIndex++
      }
    }
    ;[a[right], a[storeIndex]] = [a[storeIndex], a[right]]

    if (storeIndex === k) return a[storeIndex]
    if (storeIndex > k) right = storeIndex - 1
    else left = storeIndex + 1
  }

  return a[left]
}

// ── cumulativeFlowDiagram ─────────────────────────────────────────────────

/** Cumulative flow diagram series from per-state counts over time. */
export function cumulativeFlowDiagram(
  taskHistory: { date: string; backlog?: number; inProgress?: number; done?: number }[],
): { date: string; backlog: number; inProgress: number; done: number }[] {
  let cumBacklog = 0
  let cumInProgress = 0
  let cumDone = 0

  return taskHistory.map((entry) => {
    cumBacklog += entry.backlog ?? 0
    cumInProgress += entry.inProgress ?? 0
    cumDone += entry.done ?? 0
    return {
      date: entry.date,
      backlog: cumBacklog,
      inProgress: cumInProgress,
      done: cumDone,
    }
  })
}

// ── seasonalityDecompose ──────────────────────────────────────────────────

/** Decompose a time series into trend, seasonal, and residual components. */
export function seasonalityDecompose(
  timeSeries: number[],
  period: number,
): { trend: number[]; seasonal: number[]; residual: number[] } {
  const n = timeSeries.length
  const trend: number[] = new Array(n)
  const seasonal: number[] = new Array(n)
  const residual: number[] = new Array(n)

  const half = Math.floor(period / 2)

  for (let i = 0; i < n; i++) {
    let sum = 0
    let count = 0
    for (let j = -half; j <= half; j++) {
      const idx = i + j
      if (idx >= 0 && idx < n) {
        sum += timeSeries[idx]
        count++
      }
    }
    trend[i] = sum / count
  }

  if (period % 2 === 0) {
    const trend2: number[] = new Array(n)
    for (let i = 0; i < n; i++) {
      if (i > 0 && i < n - 1) {
        trend2[i] = (trend[i] + trend[i - 1]) / 2
      } else {
        trend2[i] = trend[i]
      }
    }
    for (let i = 0; i < n; i++) trend[i] = trend2[i]
  }

  const detrended = timeSeries.map((v, i) => v - trend[i])

  const seasonalFactors: number[] = []
  for (let p = 0; p < period; p++) {
    let sum = 0
    let count = 0
    for (let i = p; i < n; i += period) {
      sum += detrended[i]
      count++
    }
    seasonalFactors.push(count > 0 ? sum / count : 0)
  }

  const seasonalMean = seasonalFactors.reduce((a, b) => a + b, 0) / period
  for (let p = 0; p < period; p++) {
    seasonalFactors[p] -= seasonalMean
  }

  for (let i = 0; i < n; i++) {
    seasonal[i] = seasonalFactors[i % period]
    residual[i] = timeSeries[i] - trend[i] - seasonal[i]
  }

  return { trend, seasonal, residual }
}
