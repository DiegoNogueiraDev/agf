/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Graph algorithms from CLRS 4th Ed Parts VI-VII.
 * Pure functions: (nodes, edges, params) => ComputedResult.
 * No SQLite dependency — testable by construction.
 */

/**
 * Traversal algorithms — topological sort (Kahn + DFS), BFS, DFS, Tarjan SCC.
 * WHY here: graph traversal family grouped by reachability semantics.
 * Composing: re-exported via graph-algorithms.ts barrel.
 */

import type { GraphNode, GraphEdge } from '../graph/graph-types.js'
import { nodeMap } from './graph-algorithms-helpers.js'

// ── §20.4: Topological Sort (Kahn's algorithm) ──────────────────────────────

/** Topological ordering of a DAG via Kahn's algorithm (in-degree queue). */
export function topologicalSort(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const n of nodes) {
    inDegree.set(n.id, 0)
    adj.set(n.id, [])
  }
  for (const e of edges) {
    adj.get(e.from)!.push(e.to)
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1)
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const sorted: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    sorted.push(id)
    for (const neighbor of adj.get(id)!) {
      const newDeg = inDegree.get(neighbor)! - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) queue.push(neighbor)
    }
  }

  if (sorted.length !== nodes.length) return []
  const nm = nodeMap(nodes)
  return sorted.map((id) => nm.get(id)!).filter(Boolean)
}

// ── §20.3 DFS-based topological sort ───────────────────────────────────────

/** Topological ordering of a DAG via DFS post-order reversal. */
export function topologicalSortDfs(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) adj.get(e.from)!.push(e.to)

  const visited = new Set<string>()
  const stack = new Set<string>()
  const result: string[] = []

  function dfs(id: string): boolean {
    if (stack.has(id)) return false
    if (visited.has(id)) return true
    visited.add(id)
    stack.add(id)
    for (const neighbor of adj.get(id) ?? []) {
      if (!dfs(neighbor)) return false
    }
    stack.delete(id)
    result.push(id)
    return true
  }

  for (const n of nodes) {
    if (!visited.has(n.id)) {
      if (!dfs(n.id)) return []
    }
  }

  const nm = nodeMap(nodes)
  return result
    .reverse()
    .map((id) => nm.get(id)!)
    .filter(Boolean)
}

// ── §20.5: Tarjan's strongly connected components ───────────────────────────

/** Strongly connected components via Tarjan's single-pass DFS lowlink algorithm. */
export function tarjanScc(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[][] {
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) adj.get(e.from)!.push(e.to)

  const index = new Map<string, number>()
  const lowlink = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const components: GraphNode[][] = []
  let nextIndex = 0

  function strongconnect(id: string): void {
    index.set(id, nextIndex)
    lowlink.set(id, nextIndex)
    nextIndex++
    stack.push(id)
    onStack.add(id)

    for (const neighbor of adj.get(id) ?? []) {
      if (!index.has(neighbor)) {
        strongconnect(neighbor)
        lowlink.set(id, Math.min(lowlink.get(id)!, lowlink.get(neighbor)!))
      } else if (onStack.has(neighbor)) {
        lowlink.set(id, Math.min(lowlink.get(id)!, index.get(neighbor)!))
      }
    }

    if (lowlink.get(id) === index.get(id)) {
      const component: GraphNode[] = []
      const nm = nodeMap(nodes)
      while (true) {
        const w = stack.pop()!
        onStack.delete(w)
        component.push(nm.get(w)!)
        if (w === id) break
      }
      components.push(component)
    }
  }

  for (const node of nodes) {
    if (!index.has(node.id)) strongconnect(node.id)
  }

  return components
}

// ── §20.2: Breadth-First Search ─────────────────────────────────────────────

/** Breadth-first traversal order from a source node. */
export function bfs(nodes: GraphNode[], edges: GraphEdge[], source: string): GraphNode[] {
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) adj.get(e.from)!.push(e.to)

  const visited = new Set<string>()
  const queue: string[] = [source]
  const order: GraphNode[] = []
  const nm = nodeMap(nodes)

  visited.add(source)
  while (queue.length > 0) {
    const id = queue.shift()!
    order.push(nm.get(id)!)
    for (const neighbor of adj.get(id) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
  }

  return order
}

// ── §20.3: Depth-First Search ───────────────────────────────────────────────

/** Depth-first traversal order from a source node. */
export function dfs(nodes: GraphNode[], edges: GraphEdge[], source: string): GraphNode[] {
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) adj.get(e.from)!.push(e.to)

  const visited = new Set<string>()
  const order: GraphNode[] = []
  const nm = nodeMap(nodes)

  function visit(id: string): void {
    visited.add(id)
    order.push(nm.get(id)!)
    for (const neighbor of adj.get(id) ?? []) {
      if (!visited.has(neighbor)) visit(neighbor)
    }
  }

  visit(source)
  return order
}
