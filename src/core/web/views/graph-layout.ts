/*!
 * graph-layout — pure layered layout for the graph view SVG.
 * Task node_9b413ac5ddf4.
 *
 * WHY: The graph dashboard needs node positions without a layout library.
 * Hierarchical layout: nodes grouped by depth (BFS from roots), each level
 * on its own y-band, nodes spaced evenly on x. Pure: no I/O, no randomness.
 *
 * Contract: same input → same output (deterministic), no NaN positions.
 * Composes with: graph-view.ts (SVG wire), graph-snapshot.ts (CT2 types).
 */

import type { GraphSnapshotNode, GraphSnapshotEdge } from '../graph-snapshot.js'

export interface LayoutNode {
  id: string
  x: number
  y: number
  depth: number
}

const LEVEL_HEIGHT = 120
const NODE_WIDTH = 180

/**
 * Assign {x, y} positions to each node using a top-down layered layout.
 * Roots (no parentId that exists in the node set) are at depth 0.
 * Nodes at the same depth are spread evenly on x. Deterministic.
 */
export function computeLayout(nodes: GraphSnapshotNode[], _edges: GraphSnapshotEdge[]): LayoutNode[] {
  if (nodes.length === 0) return []

  const nodeIds = new Set(nodes.map((n) => n.id))
  const childrenOf = new Map<string | null, GraphSnapshotNode[]>()

  for (const n of nodes) {
    const parent = n.parentId && nodeIds.has(n.parentId) ? n.parentId : null
    const list = childrenOf.get(parent) ?? []
    list.push(n)
    childrenOf.set(parent, list)
  }

  // BFS to assign depths
  const depthMap = new Map<string, number>()
  const roots = childrenOf.get(null) ?? []
  // Sort roots by id for determinism
  roots.sort((a, b) => a.id.localeCompare(b.id))

  const queue: Array<{ node: GraphSnapshotNode; depth: number }> = roots.map((n) => ({ node: n, depth: 0 }))
  while (queue.length > 0) {
    const { node: n, depth } = queue.shift()!
    depthMap.set(n.id, depth)
    const children = (childrenOf.get(n.id) ?? []).sort((a, b) => a.id.localeCompare(b.id))
    for (const child of children) {
      if (!depthMap.has(child.id)) {
        queue.push({ node: child, depth: depth + 1 })
      }
    }
  }

  // Group by depth
  const byDepth = new Map<number, string[]>()
  for (const [id, depth] of depthMap.entries()) {
    const list = byDepth.get(depth) ?? []
    list.push(id)
    byDepth.set(depth, list)
  }

  // Sort each level by id for determinism, then assign x
  const positions = new Map<string, { x: number; y: number }>()
  for (const [depth, ids] of byDepth.entries()) {
    ids.sort()
    const totalWidth = ids.length * NODE_WIDTH
    const startX = -totalWidth / 2 + NODE_WIDTH / 2
    ids.forEach((id, idx) => {
      positions.set(id, { x: startX + idx * NODE_WIDTH, y: depth * LEVEL_HEIGHT })
    })
  }

  // Any node not reached (disconnected) gets placed at max depth + 1
  const unreached = nodes.filter((n) => !depthMap.has(n.id))
  const maxDepth = byDepth.size > 0 ? Math.max(...byDepth.keys()) : 0
  unreached.sort((a, b) => a.id.localeCompare(b.id))
  unreached.forEach((n, idx) => {
    positions.set(n.id, { x: idx * NODE_WIDTH, y: (maxDepth + 1) * LEVEL_HEIGHT })
  })

  return nodes.map((n) => {
    const pos = positions.get(n.id) ?? { x: 0, y: 0 }
    const depth = depthMap.get(n.id) ?? maxDepth + 1
    return { id: n.id, x: pos.x, y: pos.y, depth }
  })
}
