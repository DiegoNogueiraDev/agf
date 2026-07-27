/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Dependency chain analysis: transitive blockers, cycle detection, critical path.
 */

import type { GraphDocument, GraphNode } from '../graph/graph-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'dependency-chain.ts' })

/**
 * Find all transitive blockers for a given node.
 * Follows depends_on edges backwards and blocks edges forwards.
 */
export function findTransitiveBlockers(doc: GraphDocument, nodeId: string): GraphNode[] {
  const visited = new Set<string>()
  const queue: string[] = [nodeId]
  visited.add(nodeId)
  const blockers: GraphNode[] = []
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]))

  while (queue.length > 0) {
    const current = queue.shift() as string

    for (const edge of doc.edges) {
      let blockerId: string | null = null

      // "from depends_on to" means to is a blocker of from
      if (edge.from === current && edge.relationType === 'depends_on') {
        blockerId = edge.to
      } else if (edge.to === current && edge.relationType === 'blocks') {
        blockerId = edge.from
      }

      if (blockerId && !visited.has(blockerId)) {
        visited.add(blockerId)
        queue.push(blockerId)
        const node = nodeMap.get(blockerId)
        if (node) blockers.push(node)
      }
    }
  }

  log.info(`Transitive blockers for ${nodeId}: ${blockers.length} found`)
  return blockers
}

/**
 * Detect cycles in the dependency graph using DFS.
 * Only considers depends_on and blocks edges.
 */
export function detectCycles(doc: GraphDocument): string[][] {
  const adj = new Map<string, string[]>()

  for (const edge of doc.edges) {
    if (edge.relationType === 'depends_on') {
      // from depends_on to → dependency direction: from → to
      const list = adj.get(edge.from) ?? []
      list.push(edge.to)
      adj.set(edge.from, list)
    } else if (edge.relationType === 'blocks') {
      // from blocks to → dependency direction: to → from
      const list = adj.get(edge.to) ?? []
      list.push(edge.from)
      adj.set(edge.to, list)
    }
  }

  const allNodes = new Set<string>(doc.nodes.map((n) => n.id))
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const cycles: string[][] = []

  function dfs(node: string, path: string[]): void {
    visited.add(node)
    inStack.add(node)
    path.push(node)

    for (const neighbor of adj.get(node) ?? []) {
      if (inStack.has(neighbor)) {
        const cycleStart = path.indexOf(neighbor)
        cycles.push([...path.slice(cycleStart), neighbor])
      } else if (!visited.has(neighbor)) {
        dfs(neighbor, path)
      }
    }

    path.pop()
    inStack.delete(node)
  }

  for (const node of allNodes) {
    if (!visited.has(node)) {
      dfs(node, [])
    }
  }

  log.info(`Cycle detection: ${cycles.length} cycles found`)
  return cycles
}

/**
 * Find the critical path (longest path by estimateMinutes) through depends_on edges.
 * Uses topological sort on the dependency DAG.
 */
export function findCriticalPath(doc: GraphDocument): GraphNode[] {
  const DEFAULT_ESTIMATE = 60
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]))

  // Build adjacency list for depends_on edges (from depends on to → to must finish before from)
  // Direction: dependency edges point from dependent to prerequisite
  // We want longest path, so build forward graph: prerequisite → dependent
  const forward = new Map<string, string[]>()
  const inDegree = new Map<string, number>()

  for (const node of doc.nodes) {
    forward.set(node.id, [])
    inDegree.set(node.id, 0)
  }

  for (const edge of doc.edges) {
    if (edge.relationType === 'depends_on') {
      // edge.from depends_on edge.to → edge.to is prerequisite
      const list = forward.get(edge.to) ?? []
      list.push(edge.from)
      forward.set(edge.to, list)
      inDegree.set(edge.from, (inDegree.get(edge.from) ?? 0) + 1)
    }
  }

  // E5-T03: Pre-check for cycles before topological sort
  const cycles = detectCycles(doc)
  if (cycles.length > 0) {
    log.warn('critical-path:cycles-detected', { cycleCount: cycles.length })
    return [] // Return empty path instead of invalid result
  }

  // Topological sort (Kahn's algorithm) + longest path
  const dist = new Map<string, number>()
  const prev = new Map<string, string | null>()
  const queue: string[] = []

  for (const node of doc.nodes) {
    const est = node.estimateMinutes ?? DEFAULT_ESTIMATE
    dist.set(node.id, est)
    prev.set(node.id, null)
    if ((inDegree.get(node.id) ?? 0) === 0) {
      queue.push(node.id)
    }
  }

  while (queue.length > 0) {
    const current = queue.shift() as string
    const currentDist = dist.get(current) ?? 0

    for (const neighbor of forward.get(current) ?? []) {
      const neighborEst = nodeMap.get(neighbor)?.estimateMinutes ?? DEFAULT_ESTIMATE
      const newDist = currentDist + neighborEst

      if (newDist > (dist.get(neighbor) ?? 0)) {
        dist.set(neighbor, newDist)
        prev.set(neighbor, current)
      }

      const deg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, deg)
      if (deg === 0) {
        queue.push(neighbor)
      }
    }
  }

  // Find the node with maximum distance
  let maxNode: string | null = null
  let maxDist = 0
  for (const [id, d] of dist) {
    if (d > maxDist) {
      maxDist = d
      maxNode = id
    }
  }

  if (!maxNode) return []

  // Reconstruct path
  const path: GraphNode[] = []
  let current: string | null = maxNode
  while (current) {
    const node = nodeMap.get(current)
    if (node) path.unshift(node)
    current = prev.get(current) ?? null
  }

  // A single-node "path" is not a meaningful dependency chain
  if (path.length <= 1) return []

  log.info(`Critical path: ${path.length} nodes, ${maxDist} total minutes`)
  return path
}
