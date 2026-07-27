/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Graph algorithms from CLRS 4th Ed Parts VI-VII.
 * Pure functions: (nodes, edges, params) => ComputedResult.
 * No SQLite dependency — testable by construction.
 */

/**
 * Shortest path algorithms — Bellman-Ford, Dijkstra, critical path (longest DAG path), Floyd-Warshall.
 * WHY here: single-source and all-pairs path families grouped together.
 * Composing: re-exported via graph-algorithms.ts barrel.
 */

import type { GraphNode, GraphEdge } from '../graph/graph-types.js'
import { buildAdjList, nodeMap, nodeIndex } from './graph-algorithms-helpers.js'
import { topologicalSort } from './graph-algorithms-traversal.js'

// ── Type exports ────────────────────────────────────────────────────────────

export interface CriticalPathResult {
  path: GraphNode[]
  totalDuration: number
}

export interface ShortestPathResult {
  path: GraphNode[]
  distance: number
}

// ── §22.1: Bellman-Ford (shortest paths with negative weights detectable) ──

/** Single-source shortest paths allowing negative edge weights; detects negative cycles. */
export function bellmanFord(nodes: GraphNode[], edges: GraphEdge[], source: string): Map<string, number> | null {
  const dist = new Map<string, number>()
  for (const n of nodes) dist.set(n.id, Infinity)
  dist.set(source, 0)

  for (let i = 0; i < nodes.length - 1; i++) {
    for (const e of edges) {
      const w = typeof e.weight === 'number' ? e.weight : 1
      if (dist.get(e.from)! !== Infinity && dist.get(e.from)! + w < dist.get(e.to)!) {
        dist.set(e.to, dist.get(e.from)! + w)
      }
    }
  }

  for (const e of edges) {
    const w = typeof e.weight === 'number' ? e.weight : 1
    if (dist.get(e.from)! !== Infinity && dist.get(e.from)! + w < dist.get(e.to)!) {
      return null
    }
  }

  return dist
}

// ── §22.3: Dijkstra (non-negative weights) ──────────────────────────────────

/** Single-source shortest paths for non-negative edge weights via a priority queue. */
export function dijkstra(
  nodes: GraphNode[],
  edges: GraphEdge[],
  source: string,
  target?: string,
): ShortestPathResult | null {
  const adj = buildAdjList(nodes, edges)
  const dist = new Map<string, number>()
  const prev = new Map<string, string | null>()
  const unvisited = new Set<string>()

  for (const n of nodes) {
    dist.set(n.id, Infinity)
    prev.set(n.id, null)
    unvisited.add(n.id)
  }
  dist.set(source, 0)

  while (unvisited.size > 0) {
    let minId: string | null = null
    let minDist = Infinity
    for (const id of unvisited) {
      if (dist.get(id)! < minDist) {
        minDist = dist.get(id)!
        minId = id
      }
    }
    if (minId === null) break
    if (target && minId === target) break
    unvisited.delete(minId)

    for (const { to, weight } of adj.get(minId) ?? []) {
      const alt = dist.get(minId)! + weight
      if (alt < dist.get(to)!) {
        dist.set(to, alt)
        prev.set(to, minId)
      }
    }
  }

  const dest = target ?? source
  if (dist.get(dest) === Infinity) return null

  const nm = nodeMap(nodes)
  const path: GraphNode[] = []
  let cur: string | null = dest
  while (cur !== null) {
    path.push(nm.get(cur)!)
    cur = prev.get(cur) ?? null
  }

  return {
    path: path.reverse(),
    distance: dist.get(dest)!,
  }
}

// ── §22.2: Longest path in DAG (for critical path in scheduling) ──────────

/** Longest weighted path through a DAG — the project critical path (CPM). */
export function criticalPath(nodes: GraphNode[], edges: GraphEdge[]): CriticalPathResult {
  const sorted = topologicalSort(nodes, edges)
  if (sorted.length === 0) return { path: [], totalDuration: 0 }

  const adj = buildAdjList(nodes, edges)
  const dist = new Map<string, number>()
  const prev = new Map<string, string | null>()

  for (const n of nodes) {
    dist.set(n.id, 0)
    prev.set(n.id, null)
  }

  for (const u of sorted) {
    for (const { to, weight } of adj.get(u.id) ?? []) {
      if (dist.get(u.id)! + weight > dist.get(to)!) {
        dist.set(to, dist.get(u.id)! + weight)
        prev.set(to, u.id)
      }
    }
  }

  let endNode = sorted[0].id
  let maxDist = 0
  for (const n of nodes) {
    if (dist.get(n.id)! > maxDist) {
      maxDist = dist.get(n.id)!
      endNode = n.id
    }
  }

  const nm = nodeMap(nodes)
  const path: GraphNode[] = []
  let cur: string | null = endNode
  while (cur !== null) {
    path.push(nm.get(cur)!)
    cur = prev.get(cur) ?? null
  }

  return { path: path.reverse(), totalDuration: maxDist }
}

// ── §23.2: Floyd-Warshall (all-pairs shortest paths) ────────────────────────

/** All-pairs shortest paths via dynamic programming over intermediate vertices. */
export function floydWarshall(nodes: GraphNode[], edges: GraphEdge[]): Map<string, Map<string, number>> | null {
  const idx = nodeIndex(nodes)
  const n = nodes.length
  const dist: number[][] = Array.from({ length: n }, () => Array(n).fill(Infinity))

  for (let i = 0; i < n; i++) dist[i][i] = 0
  for (const e of edges) {
    const w = typeof e.weight === 'number' ? e.weight : 1
    const u = idx.get(e.from)!
    const v = idx.get(e.to)!
    if (w < dist[u][v]) dist[u][v] = w
  }

  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      if (dist[i][k] === Infinity) continue
      const dik = dist[i][k]
      for (let j = 0; j < n; j++) {
        if (dist[k][j] === Infinity) continue
        const nd = dik + dist[k][j]
        if (nd < dist[i][j]) dist[i][j] = nd
      }
    }
  }

  const result = new Map<string, Map<string, number>>()
  for (let i = 0; i < n; i++) {
    const row = new Map<string, number>()
    for (let j = 0; j < n; j++) {
      row.set(nodes[j].id, dist[i][j])
    }
    result.set(nodes[i].id, row)
  }

  return result
}
