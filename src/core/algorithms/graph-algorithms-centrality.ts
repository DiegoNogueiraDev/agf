/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Graph algorithms from CLRS 4th Ed Parts VI-VII.
 * Pure functions: (nodes, edges, params) => ComputedResult.
 * No SQLite dependency — testable by construction.
 */

/**
 * Centrality and structural metrics — PageRank, betweenness, closeness, degree centrality,
 * articulation points, bridges, density, diameter.
 * WHY here: node/graph importance metrics grouped by structural analysis.
 * Composing: re-exported via graph-algorithms.ts barrel.
 */

import type { GraphNode, GraphEdge } from '../graph/graph-types.js'
import { nodeMap } from './graph-algorithms-helpers.js'
import { floydWarshall } from './graph-algorithms-shortest-path.js'

// ── §22.5 + custom: PageRank (iterative) ────────────────────────────────────

/** PageRank centrality via power iteration with damping. */
export function pageRank(
  nodes: GraphNode[],
  edges: GraphEdge[],
  dampingFactor = 0.85,
  maxIterations = 100,
  tolerance = 1e-6,
): Map<string, number> {
  const n = nodes.length
  if (n === 0) return new Map()

  const outDegree = new Map<string, number>()
  const incoming = new Map<string, string[]>()
  for (const n of nodes) {
    outDegree.set(n.id, 0)
    incoming.set(n.id, [])
  }
  for (const e of edges) {
    outDegree.set(e.from, (outDegree.get(e.from) ?? 0) + 1)
    incoming.get(e.to)!.push(e.from)
  }

  let rank = new Map<string, number>()
  for (const node of nodes) rank.set(node.id, 1 / n)

  for (let iter = 0; iter < maxIterations; iter++) {
    const next = new Map<string, number>()
    let danglingSum = 0
    for (const node of nodes) {
      if ((outDegree.get(node.id) ?? 0) === 0) {
        danglingSum += (rank.get(node.id) ?? 0) / n
      }
    }
    danglingSum *= dampingFactor

    for (const node of nodes) {
      let sum = 0
      for (const incomingId of incoming.get(node.id) ?? []) {
        const od = outDegree.get(incomingId) ?? 1
        sum += (rank.get(incomingId) ?? 0) / od
      }
      next.set(node.id, (1 - dampingFactor) / n + dampingFactor * sum + danglingSum)
    }

    let diff = 0
    for (const node of nodes) {
      diff += Math.abs((next.get(node.id) ?? 0) - (rank.get(node.id) ?? 0))
    }
    rank = next
    if (diff < tolerance) break
  }

  return rank
}

// ── Custom: Betweenness Centrality (Brandes' algorithm) ─────────────────────

/** Betweenness centrality — fraction of shortest paths passing through each node (Brandes). */
export function betweennessCentrality(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) {
    adj.get(e.from)!.push(e.to)
    adj.get(e.to)!.push(e.from)
  }

  const cb = new Map<string, number>()
  for (const n of nodes) cb.set(n.id, 0)

  for (const s of nodes) {
    const stack: string[] = []
    const pred = new Map<string, string[]>()
    const sigma = new Map<string, number>()
    const dist = new Map<string, number>()
    const delta = new Map<string, number>()

    for (const n of nodes) {
      pred.set(n.id, [])
      sigma.set(n.id, 0)
      dist.set(n.id, -1)
      delta.set(n.id, 0)
    }
    sigma.set(s.id, 1)
    dist.set(s.id, 0)

    const queue: string[] = [s.id]
    while (queue.length > 0) {
      const v = queue.shift()!
      stack.push(v)
      for (const w of adj.get(v) ?? []) {
        if (dist.get(w)! < 0) {
          dist.set(w, dist.get(v)! + 1)
          queue.push(w)
        }
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, (sigma.get(w) ?? 0) + (sigma.get(v) ?? 0))
          pred.get(w)!.push(v)
        }
      }
    }

    while (stack.length > 0) {
      const w = stack.pop()!
      for (const v of pred.get(w) ?? []) {
        delta.set(v, (delta.get(v) ?? 0) + ((sigma.get(v) ?? 0) / (sigma.get(w) ?? 1)) * (1 + (delta.get(w) ?? 0)))
      }
      if (w !== s.id) {
        cb.set(w, (cb.get(w) ?? 0) + (delta.get(w) ?? 0))
      }
    }
  }

  return cb
}

// ── Custom: Closeness Centrality ────────────────────────────────────────────

/** Closeness centrality — inverse of mean shortest-path distance to all other nodes. */
export function closenessCentrality(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) {
    adj.get(e.from)!.push(e.to)
    adj.get(e.to)!.push(e.from)
  }

  const result = new Map<string, number>()

  for (const s of nodes) {
    const dist = new Map<string, number>()
    for (const n of nodes) dist.set(n.id, -1)
    dist.set(s.id, 0)
    const queue: string[] = [s.id]

    while (queue.length > 0) {
      const v = queue.shift()!
      for (const w of adj.get(v) ?? []) {
        if (dist.get(w)! < 0) {
          dist.set(w, dist.get(v)! + 1)
          queue.push(w)
        }
      }
    }

    let totalDist = 0
    let reachable = 0
    for (const n of nodes) {
      if (n.id !== s.id && dist.get(n.id)! > 0) {
        totalDist += dist.get(n.id)!
        reachable++
      }
    }
    result.set(s.id, reachable > 0 ? reachable / totalDist : 0)
  }

  return result
}

// ── Custom: Degree Centrality ──────────────────────────────────────────────

/** Degree centrality — normalized count of incident edges per node. */
export function degreeCentrality(nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const degree = new Map<string, number>()
  for (const n of nodes) degree.set(n.id, 0)
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1)
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1)
  }

  const maxDeg = Math.max(...degree.values(), 1)
  const result = new Map<string, number>()
  for (const [id, deg] of degree) result.set(id, deg / maxDeg)
  return result
}

// ── Custom: Articulation points (cut vertices) ─────────────────────────────

/** Articulation points (cut vertices) whose removal disconnects the graph. */
export function articulationPoints(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) {
    adj.get(e.from)!.push(e.to)
    adj.get(e.to)!.push(e.from)
  }

  const visited = new Set<string>()
  const tin = new Map<string, number>()
  const low = new Map<string, number>()
  const isArticulation = new Set<string>()
  let timer = 0

  function dfs(v: string, parent: string | null): void {
    visited.add(v)
    tin.set(v, timer)
    low.set(v, timer)
    timer++
    let children = 0

    for (const to of adj.get(v) ?? []) {
      if (to === parent) continue
      if (visited.has(to)) {
        low.set(v, Math.min(low.get(v)!, tin.get(to)!))
      } else {
        dfs(to, v)
        low.set(v, Math.min(low.get(v)!, low.get(to)!))
        if (low.get(to)! >= tin.get(v)! && parent !== null) {
          isArticulation.add(v)
        }
        children++
      }
    }

    if (parent === null && children > 1) {
      isArticulation.add(v)
    }
  }

  for (const n of nodes) {
    if (!visited.has(n.id)) dfs(n.id, null)
  }

  const nm = nodeMap(nodes)
  return Array.from(isArticulation)
    .map((id) => nm.get(id)!)
    .filter(Boolean)
}

// ── Custom: Bridges ─────────────────────────────────────────────────────────

/** Bridge edges whose removal increases the number of connected components. */
export function bridges(nodes: GraphNode[], edges: GraphEdge[]): GraphEdge[] {
  const adj = new Map<string, Array<{ to: string; edgeId: string }>>()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) {
    adj.get(e.from)!.push({ to: e.to, edgeId: e.id })
    adj.get(e.to)!.push({ to: e.from, edgeId: e.id })
  }

  const visited = new Set<string>()
  const tin = new Map<string, number>()
  const low = new Map<string, number>()
  const bridgeEdges: GraphEdge[] = []
  let timer = 0
  const edgeMap = new Map<string, GraphEdge>()
  for (const e of edges) edgeMap.set(e.id, e)

  function dfs(v: string, parentEdgeId: string | null): void {
    visited.add(v)
    tin.set(v, timer)
    low.set(v, timer)
    timer++

    for (const { to, edgeId } of adj.get(v) ?? []) {
      if (edgeId === parentEdgeId) continue
      if (visited.has(to)) {
        low.set(v, Math.min(low.get(v)!, tin.get(to)!))
      } else {
        dfs(to, edgeId)
        low.set(v, Math.min(low.get(v)!, low.get(to)!))
        if (low.get(to)! > tin.get(v)!) {
          const e = edgeMap.get(edgeId)
          if (e) bridgeEdges.push(e)
        }
      }
    }
  }

  for (const n of nodes) {
    if (!visited.has(n.id)) dfs(n.id, null)
  }

  return bridgeEdges
}

// ── Graph density ──────────────────────────────────────────────────────────

/** Graph density — ratio of actual edges to maximum possible edges. */
export function graphDensity(nodes: GraphNode[], edges: GraphEdge[]): number {
  const n = nodes.length
  if (n < 2) return 0
  const maxEdges = n * (n - 1)
  return edges.length / maxEdges
}

// ── Graph diameter (longest shortest path) ──────────────────────────────────

/** Graph diameter — the longest shortest-path distance between any two nodes. */
export function graphDiameter(nodes: GraphNode[], edges: GraphEdge[]): number {
  const sp = floydWarshall(nodes, edges)
  if (!sp) return Infinity
  let maxDist = 0
  for (const [u, row] of sp) {
    for (const [v, d] of row) {
      if (u !== v && d !== Infinity && d > maxDist) maxDist = d
    }
  }
  return maxDist
}
