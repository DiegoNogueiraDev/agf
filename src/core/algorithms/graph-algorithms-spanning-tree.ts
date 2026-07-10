/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Graph algorithms from CLRS 4th Ed Parts VI-VII.
 * Pure functions: (nodes, edges, params) => ComputedResult.
 * No SQLite dependency — testable by construction.
 */

/**
 * Spanning tree algorithms — Kruskal's and Prim's MST.
 * WHY here: minimum spanning tree family.
 * Composing: re-exported via graph-algorithms.ts barrel.
 */

import type { GraphNode, GraphEdge } from '../graph/graph-types.js'
import { buildUndirectedAdjList } from './graph-algorithms-helpers.js'

// ── Type exports ────────────────────────────────────────────────────────────

export interface MinimumSpanningTreeResult {
  edges: GraphEdge[]
  totalWeight: number
}

// ── §21.2: Kruskal's Minimum Spanning Tree ──────────────────────────────────

/** Minimum spanning tree via Kruskal's algorithm (sorted edges + union-find). */
export function kruskalMst(nodes: GraphNode[], edges: GraphEdge[]): MinimumSpanningTreeResult {
  const parent = new Map<string, string>()
  const rank = new Map<string, number>()

  function find(x: string): string {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!))
    return parent.get(x)!
  }

  function union(x: string, y: string): void {
    const rx = find(x)
    const ry = find(y)
    if (rx === ry) return
    const rr = rank.get(rx)!
    const ryR = rank.get(ry)!
    if (rr < ryR) {
      parent.set(rx, ry)
    } else if (rr > ryR) {
      parent.set(ry, rx)
    } else {
      parent.set(ry, rx)
      rank.set(rx, rr + 1)
    }
  }

  for (const n of nodes) {
    parent.set(n.id, n.id)
    rank.set(n.id, 0)
  }

  const sorted = [...edges]
    .filter((e) => typeof e.weight === 'number')
    .sort((a, b) => (a.weight ?? 1) - (b.weight ?? 1))

  const mstEdges: GraphEdge[] = []
  let totalWeight = 0

  for (const e of sorted) {
    if (find(e.from) !== find(e.to)) {
      union(e.from, e.to)
      mstEdges.push(e)
      totalWeight += e.weight!
    }
  }

  return { edges: mstEdges, totalWeight }
}

// ── §21.2: Prim's Minimum Spanning Tree ─────────────────────────────────────

/** Minimum spanning tree via Prim's algorithm growing from a start node. */
export function primMst(nodes: GraphNode[], edges: GraphEdge[], start: string): MinimumSpanningTreeResult {
  const adj = buildUndirectedAdjList(nodes, edges)
  const key = new Map<string, number>()
  const parent = new Map<string, string | null>()
  const inMst = new Set<string>()

  for (const n of nodes) {
    key.set(n.id, Infinity)
    parent.set(n.id, null)
  }
  key.set(start, 0)

  for (let i = 0; i < nodes.length; i++) {
    let minId: string | null = null
    let minKey = Infinity
    for (const n of nodes) {
      if (!inMst.has(n.id) && key.get(n.id)! < minKey) {
        minKey = key.get(n.id)!
        minId = n.id
      }
    }
    if (minId === null) break
    inMst.add(minId)

    for (const { to, weight } of adj.get(minId) ?? []) {
      if (!inMst.has(to) && weight < key.get(to)!) {
        key.set(to, weight)
        parent.set(to, minId)
      }
    }
  }

  const mstEdges: GraphEdge[] = []
  let totalWeight = 0
  for (const n of nodes) {
    const p = parent.get(n.id)
    if (p !== null && p !== undefined) {
      const edge = edges.find((e) => (e.from === p && e.to === n.id) || (e.from === n.id && e.to === p))
      if (edge) {
        mstEdges.push(edge)
        totalWeight += typeof edge.weight === 'number' ? edge.weight : 1
      }
    }
  }

  return { edges: mstEdges, totalWeight }
}
