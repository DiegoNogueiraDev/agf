/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Graph algorithms from CLRS 4th Ed Parts VI-VII.
 * Pure functions: (nodes, edges, params) => ComputedResult.
 * No SQLite dependency — testable by construction.
 */

/**
 * Flow and assignment algorithms — Ford-Fulkerson max-flow, Hungarian assignment.
 * WHY here: network flow family.
 * Composing: re-exported via graph-algorithms.ts barrel.
 */

import type { GraphNode, GraphEdge } from '../graph/graph-types.js'
import { nodeIndex } from './graph-algorithms-helpers.js'

// ── Type exports ────────────────────────────────────────────────────────────

export interface AssignmentResult {
  assignment: Array<[number, number]>
  totalCost: number
}

// ── §24.2: Ford-Fulkerson (maximum flow) ────────────────────────────────────

/** Maximum flow between source and sink via Ford-Fulkerson augmenting paths. */
export function fordFulkerson(nodes: GraphNode[], edges: GraphEdge[], source: string, sink: string): number {
  const adj = new Map<string, Array<{ to: string; weight: number }>>()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) {
    const w = typeof e.weight === 'number' ? e.weight : 1
    adj.get(e.from)!.push({ to: e.to, weight: w })
  }

  const idx = nodeIndex(nodes)
  const n = nodes.length
  const capacity: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
  for (const e of edges) {
    const w = typeof e.weight === 'number' ? e.weight : 1
    capacity[idx.get(e.from)!][idx.get(e.to)!] += w
  }

  let flow = 0
  const parent = Array(n).fill(-1)

  function bfsResidual(): boolean {
    parent.fill(-1)
    parent[idx.get(source)!] = -2
    const queue: number[] = [idx.get(source)!]
    while (queue.length > 0) {
      const u = queue.shift()!
      for (let v = 0; v < n; v++) {
        if (parent[v] === -1 && capacity[u][v] > 0) {
          parent[v] = u
          if (v === idx.get(sink)!) return true
          queue.push(v)
        }
      }
    }
    return false
  }

  while (bfsResidual()) {
    let pathFlow = Infinity
    let v = idx.get(sink)!
    while (v !== idx.get(source)!) {
      const u = parent[v]
      pathFlow = Math.min(pathFlow, capacity[u][v])
      v = u
    }
    v = idx.get(sink)!
    while (v !== idx.get(source)!) {
      const u = parent[v]
      capacity[u][v] -= pathFlow
      capacity[v][u] += pathFlow
      v = u
    }
    flow += pathFlow
  }

  return flow
}

// ── §25.3: Hungarian algorithm (assignment problem) ─────────────────────────

/** Optimal assignment minimizing total cost via the Hungarian (Kuhn-Munkres) algorithm. */
export function hungarian(cost: number[][]): AssignmentResult {
  const n = cost.length
  if (n === 0) return { assignment: [], totalCost: 0 }
  const m = cost[0].length
  const u = Array(n + 1).fill(0)
  const v = Array(m + 1).fill(0)
  const p = Array(m + 1).fill(0)
  const way = Array(m + 1).fill(0)

  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = Array(m + 1).fill(Infinity)
    const used = Array(m + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= m; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
          if (cur < minv[j]) {
            minv[j] = cur
            way[j] = j0
          }
          if (minv[j] < delta) {
            delta = minv[j]
            j1 = j
          }
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else {
          minv[j] -= delta
        }
      }
      j0 = j1
    } while (p[j0] !== 0)

    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0 !== 0)
  }

  const assignment: Array<[number, number]> = []
  for (let j = 1; j <= m; j++) {
    if (p[j] > 0) assignment.push([p[j] - 1, j - 1])
  }

  return { assignment, totalCost: -v[0] }
}
