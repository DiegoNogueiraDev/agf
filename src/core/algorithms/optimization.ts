/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Optimization algorithms — heuristic, exact, and metaheuristic methods.
 * Pure functions with no SQLite dependency.
 */

// ── K-Means Clustering ───────────────────────────────────────────────────

/** k-means clustering — partition points into k clusters by Lloyd's iteration. */
export function kmeansClustering(
  data: number[][],
  k: number,
  maxIterations = 100,
): { clusters: number[][][]; centroids: number[][]; assignments: number[] } {
  const n = data.length
  const dim = data[0].length

  if (n === 0) return { clusters: [], centroids: [], assignments: [] }

  const centroids = data.slice(0, k)
  const assignments = Array(n).fill(0)

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false

    for (let i = 0; i < n; i++) {
      let minDist = Infinity
      let best = 0
      for (let j = 0; j < k; j++) {
        let dist = 0
        for (let d = 0; d < dim; d++) {
          dist += (data[i][d] - centroids[j][d]) ** 2
        }
        if (dist < minDist) {
          minDist = dist
          best = j
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best
        changed = true
      }
    }

    if (!changed) break

    const sums = Array.from({ length: k }, () => Array(dim).fill(0))
    const counts = Array(k).fill(0)

    for (let i = 0; i < n; i++) {
      const a = assignments[i]
      counts[a]++
      for (let d = 0; d < dim; d++) sums[a][d] += data[i][d]
    }

    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) {
        for (let d = 0; d < dim; d++) centroids[j][d] = sums[j][d] / counts[j]
      }
    }
  }

  const clusters: number[][][] = Array.from({ length: k }, () => [])
  for (let i = 0; i < n; i++) {
    clusters[assignments[i]].push(data[i])
  }

  return { clusters, centroids, assignments }
}

// ── Gradient Descent ─────────────────────────────────────────────────────

/** Minimize a differentiable objective via iterative gradient descent. */
export function gradientDescent(params: {
  costFn: (params: number[]) => number
  gradientFn: (params: number[]) => number[]
  initialParams: number[]
  learningRate: number
  iterations: number
}): { params: number[]; costHistory: number[] } {
  const { costFn, gradientFn, initialParams, learningRate, iterations } = params
  const p = [...initialParams]
  const costHistory: number[] = []

  for (let i = 0; i < iterations; i++) {
    const grad = gradientFn(p)
    for (let j = 0; j < p.length; j++) {
      p[j] -= learningRate * grad[j]
    }
    costHistory.push(costFn(p))
  }

  return { params: p, costHistory }
}

// ── Multiplicative Weights (Hedge algorithm) ─────────────────────────────

/** Multiplicative-weights update for online learning over expert advice. */
export function multiplicativeWeights(
  expertPayoffs: number[][],
  learningRate = 0.1,
  rounds?: number,
): { weights: number[]; regret: number; bestExpert: number } {
  const T = rounds !== undefined ? Math.min(rounds, expertPayoffs.length) : expertPayoffs.length
  const n = expertPayoffs[0]?.length ?? 0

  const weights = Array(n).fill(1)
  const cumulativePayoffs = Array(n).fill(0)
  let cumulativeAlgoPayoff = 0

  for (let t = 0; t < T; t++) {
    const row = expertPayoffs[t]
    const totalWeight = weights.reduce((s, w) => s + w, 0)
    const probs = weights.map((w) => w / totalWeight)

    let algoPayoff = 0
    for (let i = 0; i < n; i++) {
      const payoff = row[i] ?? 0
      cumulativePayoffs[i] += payoff
      algoPayoff += probs[i] * payoff
      weights[i] *= Math.exp(learningRate * payoff)
    }
    cumulativeAlgoPayoff += algoPayoff
  }

  const bestExpert = cumulativePayoffs.indexOf(Math.max(...cumulativePayoffs))
  const bestCumulative = cumulativePayoffs[bestExpert]
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  const normalizedWeights = weights.map((w) => w / totalWeight)

  return {
    weights: normalizedWeights,
    regret: bestCumulative - cumulativeAlgoPayoff,
    bestExpert,
  }
}

// ── Greedy Set Cover ─────────────────────────────────────────────────────

/** Greedy approximation of the minimum set cover problem. */
export function setCover(
  universe: string[],
  subsets: Map<string, string[]>,
): { selected: string[]; covered: number; totalWeight: number } {
  const uncovered = new Set(universe)
  const selected: string[] = []
  const subsetEntries = Array.from(subsets.entries())

  while (uncovered.size > 0) {
    let bestIdx = -1
    let bestCount = 0

    for (let i = 0; i < subsetEntries.length; i++) {
      const [, elements] = subsetEntries[i]
      let count = 0
      for (const elem of elements) {
        if (uncovered.has(elem)) count++
      }
      if (count > bestCount) {
        bestCount = count
        bestIdx = i
      }
    }

    if (bestIdx === -1) break

    const [name, elements] = subsetEntries[bestIdx]
    selected.push(name)
    for (const elem of elements) uncovered.delete(elem)
    subsetEntries.splice(bestIdx, 1)
  }

  return {
    selected,
    covered: universe.length - uncovered.size,
    totalWeight: selected.length,
  }
}

// ── TSP Nearest Neighbor ─────────────────────────────────────────────────

/** Travelling-salesman tour via the nearest-neighbour heuristic. */
export function tspNearestNeighbor(cities: [number, number][]): { route: number[]; distance: number } {
  const n = cities.length
  if (n === 0) return { route: [], distance: 0 }
  if (n === 1) return { route: [0], distance: 0 }

  const visited = new Set<number>()
  const route: number[] = []
  let current = 0
  visited.add(0)
  route.push(0)
  let distance = 0

  while (route.length < n) {
    let nearest = -1
    let minDist = Infinity
    for (let i = 0; i < n; i++) {
      if (!visited.has(i)) {
        const dx = cities[current][0] - cities[i][0]
        const dy = cities[current][1] - cities[i][1]
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < minDist) {
          minDist = dist
          nearest = i
        }
      }
    }
    distance += minDist
    visited.add(nearest)
    route.push(nearest)
    current = nearest
  }

  distance += Math.sqrt((cities[current][0] - cities[0][0]) ** 2 + (cities[current][1] - cities[0][1]) ** 2)

  return { route, distance }
}

// ── Vertex Cover 2-Approximation ─────────────────────────────────────────

/** 2-approximation of minimum vertex cover via maximal matching. */
export function vertexCoverApprox(edges: [number, number][]): { vertices: Set<number>; size: number } {
  const vertices = new Set<number>()
  const uncovered = edges.map((e) => [...e] as [number, number])

  while (uncovered.length > 0) {
    const [u, v] = uncovered[0]
    vertices.add(u)
    vertices.add(v)

    let i = uncovered.length - 1
    while (i >= 0) {
      const [a, b] = uncovered[i]
      if (a === u || a === v || b === u || b === v) {
        uncovered.splice(i, 1)
      }
      i--
    }
  }

  return { vertices, size: vertices.size }
}

// ── Genetic Algorithm (knapsack) ─────────────────────────────────────────

/** Genetic algorithm optimizing a fitness function via selection, crossover, mutation. */
export function geneticAlgorithm(params: {
  tasks: { id: string; effort: number; value: number }[]
  maxEffort: number
  populationSize?: number
  generations?: number
  mutationRate?: number
}): { schedule: string[]; totalValue: number; generation: number } {
  const { tasks, maxEffort, populationSize = 20, generations = 50, mutationRate = 0.1 } = params

  const n = tasks.length
  if (n === 0 || maxEffort <= 0) {
    return { schedule: [], totalValue: 0, generation: generations }
  }

  let seed = 42
  function rand(): number {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }

  function randomGenes(): number[] {
    return Array.from({ length: n }, () => (rand() > 0.5 ? 1 : 0))
  }

  function fitness(genes: number[]): number {
    let effort = 0
    let value = 0
    for (let i = 0; i < n; i++) {
      if (genes[i]) {
        effort += tasks[i].effort
        value += tasks[i].value
      }
    }
    return effort <= maxEffort ? value : 0
  }

  function decode(genes: number[]): string[] {
    const result: string[] = []
    for (let i = 0; i < n; i++) {
      if (genes[i]) result.push(tasks[i].id)
    }
    return result
  }

  let population: number[][] = Array.from({ length: populationSize }, () => randomGenes())

  let bestGenes = [...population[0]]
  let bestFitness = fitness(bestGenes)

  for (let gen = 0; gen < generations; gen++) {
    const scored = population.map((g) => ({ genes: g, fit: fitness(g) }))
    scored.sort((a, b) => b.fit - a.fit)

    if (scored[0].fit > bestFitness) {
      bestGenes = [...scored[0].genes]
      bestFitness = scored[0].fit
    }

    const next: number[][] = []
    next.push([...scored[0].genes])
    if (populationSize > 1) next.push([...scored[1].genes])

    while (next.length < populationSize) {
      const tournament = (): number[] => {
        const a = scored[Math.floor(rand() * Math.min(scored.length, 5))].genes
        const b = scored[Math.floor(rand() * Math.min(scored.length, 5))].genes
        return fitness(a) >= fitness(b) ? [...a] : [...b]
      }
      const p1 = tournament()
      const p2 = tournament()

      const child: number[] = []
      const xover = Math.floor(rand() * n)
      for (let j = 0; j < n; j++) {
        child.push(j < xover ? p1[j] : p2[j])
      }

      for (let j = 0; j < n; j++) {
        if (rand() < mutationRate) child[j] = 1 - child[j]
      }

      next.push(child)
    }

    population = next
  }

  return { schedule: decode(bestGenes), totalValue: bestFitness, generation: generations }
}

// ── Branch and Bound (assignment) ────────────────────────────────────────

/** Branch-and-bound search pruning subtrees that cannot beat the best bound. */
export function branchAndBound(costMatrix: number[][]): {
  assignment: [number, number][]
  totalCost: number
  nodesVisited: number
} {
  const n = costMatrix.length
  if (n === 0) return { assignment: [], totalCost: 0, nodesVisited: 0 }
  if (n === 1) return { assignment: [[0, 0]], totalCost: costMatrix[0][0], nodesVisited: 1 }

  let bestCost = Infinity
  let bestAssignment: [number, number][] = []
  let nodesVisited = 0

  function dfs(
    person: number,
    assigned: Set<number>,
    currentCost: number,
    currentAssignment: [number, number][],
  ): void {
    nodesVisited++
    if (person === n) {
      if (currentCost < bestCost) {
        bestCost = currentCost
        bestAssignment = currentAssignment.map((a) => [a[0], a[1]] as [number, number])
      }
      return
    }

    for (let j = 0; j < n; j++) {
      if (assigned.has(j)) continue
      const newCost = currentCost + costMatrix[person][j]
      if (newCost >= bestCost) continue

      assigned.add(j)
      currentAssignment.push([person, j])
      dfs(person + 1, assigned, newCost, currentAssignment)
      currentAssignment.pop()
      assigned.delete(j)
    }
  }

  dfs(0, new Set<number>(), 0, [])

  return { assignment: bestAssignment, totalCost: bestCost, nodesVisited }
}

// ── Backtracking CSP Solver ──────────────────────────────────────────────

/** Generic backtracking solver exploring partial assignments with pruning. */
export function backtrackingSolver(params: {
  variables: string[]
  domains: Map<string, unknown[]>
  constraints: ((assignment: Map<string, unknown>) => boolean)[]
}): { solution: Map<string, unknown> | null; backtracks: number } {
  const { variables, domains, constraints } = params
  let backtracks = 0
  let solution: Map<string, unknown> | null = null

  function isConsistent(assignment: Map<string, unknown>): boolean {
    for (const constraint of constraints) {
      if (!constraint(new Map(assignment))) return false
    }
    return true
  }

  function solve(assignment: Map<string, unknown>, index: number): boolean {
    if (index === variables.length) {
      solution = new Map(assignment)
      return true
    }

    const varName = variables[index]
    const domain = domains.get(varName) ?? []

    for (const value of domain) {
      assignment.set(varName, value)
      if (isConsistent(assignment)) {
        if (solve(assignment, index + 1)) return true
      } else {
        backtracks++
      }
      assignment.delete(varName)
    }

    return false
  }

  solve(new Map<string, unknown>(), 0)

  return { solution, backtracks }
}

// ── Linear Programming (2D vertex enumeration) ──────────────────────────

function combinations(arr: number[], k: number): number[][] {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [first, ...rest] = arr
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c])
  const withoutFirst = combinations(rest, k)
  return [...withFirst, ...withoutFirst]
}

function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = A.length
  const aug = A.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    let maxRow = col
    let maxVal = Math.abs(aug[col][col])
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col])
        maxRow = row
      }
    }
    if (maxVal < 1e-12) return null
    ;[aug[col], aug[maxRow]] = [aug[maxRow], aug[col]]

    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col]
      for (let j = col; j <= n; j++) aug[row][j] -= factor * aug[col][j]
    }
  }

  const x = Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let sum = aug[i][n]
    for (let j = i + 1; j < n; j++) sum -= aug[i][j] * x[j]
    x[i] = sum / aug[i][i]
  }

  return x
}

/** Solve a linear program (maximize/minimize under linear constraints). */
export function linearProgramming(params: { c: number[]; A: number[][]; b: number[] }): {
  x: number[]
  optimalValue: number
  feasible: boolean
} {
  const { c, A, b } = params
  const dim = c.length

  const allA: number[][] = []
  const allB: number[] = []

  for (let i = 0; i < A.length; i++) {
    allA.push([...A[i]])
    allB.push(b[i])
  }
  for (let j = 0; j < dim; j++) {
    const row = Array(dim).fill(0)
    row[j] = -1
    allA.push(row)
    allB.push(0)
  }

  if (dim > 2) {
    const indices = Array.from({ length: allA.length }, (_, i) => i)
    let bestX: number[] | null = null
    let bestObj = -Infinity

    for (const subset of combinations(indices, dim)) {
      const As = subset.map((i) => allA[i])
      const bs = subset.map((i) => allB[i])
      const x = solveLinear(As, bs)
      if (!x) continue
      if (x.some((v) => !Number.isFinite(v))) continue

      let ok = true
      for (let i = 0; i < allA.length; i++) {
        const dot = allA[i].reduce((s, a, j) => s + a * x[j], 0)
        if (dot > allB[i] + 1e-10) {
          ok = false
          break
        }
      }
      if (!ok) continue

      const obj = c.reduce((s, cj, j) => s + cj * x[j], 0)
      if (obj > bestObj) {
        bestObj = obj
        bestX = x
      }
    }

    if (!bestX) return { x: [], optimalValue: -Infinity, feasible: false }
    return { x: bestX, optimalValue: bestObj, feasible: true }
  }

  const indices = Array.from({ length: allA.length }, (_, i) => i)
  let bestX: number[] | null = null
  let bestObj = -Infinity

  for (const subset of combinations(indices, dim)) {
    const As = subset.map((i) => allA[i])
    const bs = subset.map((i) => allB[i])
    const x = solveLinear(As, bs)
    if (!x) continue
    if (x.some((v) => !Number.isFinite(v))) continue

    let ok = true
    for (let i = 0; i < allA.length; i++) {
      const dot = allA[i].reduce((s, a, j) => s + a * x[j], 0)
      if (dot > allB[i] + 1e-10) {
        ok = false
        break
      }
    }
    if (!ok) continue

    const obj = c.reduce((s, cj, j) => s + cj * x[j], 0)
    if (obj > bestObj) {
      bestObj = obj
      bestX = x
    }
  }

  if (!bestX) return { x: [], optimalValue: -Infinity, feasible: false }
  return { x: bestX, optimalValue: bestObj, feasible: true }
}
