/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Graph algorithms from CLRS 4th Ed Parts VI-VII.
 * Pure functions: (nodes, edges, params) => ComputedResult.
 * No SQLite dependency — testable by construction.
 */

/**
 * Internal helper functions for graph algorithm implementations.
 * WHY here: shared across family modules, not part of the public API.
 * Composing: imported by all algorithm family files.
 */

import type { GraphNode, GraphEdge } from '../graph/graph-types.js'

// ── Type exports ────────────────────────────────────────────────────────────

export type AdjList = Map<string, Array<{ to: string; weight: number; edgeId: string }>>
export type AdjMatrix = Map<string, Map<string, number>>

// ── Helpers ─────────────────────────────────────────────────────────────────

export function buildAdjList(nodes: GraphNode[], edges: GraphEdge[]): AdjList {
  const adj: AdjList = new Map()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) {
    const w = typeof e.weight === 'number' ? e.weight : 1
    adj.get(e.from)!.push({ to: e.to, weight: w, edgeId: e.id })
    if (e.relationType !== 'depends_on' && e.relationType !== 'blocks') continue
  }
  return adj
}

export function buildUndirectedAdjList(nodes: GraphNode[], edges: GraphEdge[]): AdjList {
  const adj: AdjList = new Map()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) {
    const w = typeof e.weight === 'number' ? e.weight : 1
    adj.get(e.from)!.push({ to: e.to, weight: w, edgeId: e.id })
    adj.get(e.to)!.push({ to: e.from, weight: w, edgeId: e.id })
  }
  return adj
}

export function nodeMap(nodes: GraphNode[]): Map<string, GraphNode> {
  const m = new Map<string, GraphNode>()
  for (const n of nodes) m.set(n.id, n)
  return m
}

export function edgeListToNeighbors(nodes: GraphNode[], edges: GraphEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()
  for (const n of nodes) adj.set(n.id, new Set())
  for (const e of edges) {
    adj.get(e.from)!.add(e.to)
  }
  return adj
}

export function nodeIndex(nodes: GraphNode[]): Map<string, number> {
  const idx = new Map<string, number>()
  for (let i = 0; i < nodes.length; i++) idx.set(nodes[i].id, i)
  return idx
}

export function ensureIntegerWeights(edges: GraphEdge[]): number[][] {
  const n = edges.length
  const m: number[][] = Array.from({ length: n }, () => Array(n).fill(Infinity))
  for (const e of edges) {
    const w = typeof e.weight === 'number' ? Math.round(e.weight) : 1
    m[e.from.charCodeAt(0) - 97][e.to.charCodeAt(0) - 97] = w
  }
  return m
}
