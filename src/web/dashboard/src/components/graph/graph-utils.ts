/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import dagre from '@dagrejs/dagre'
import type { Node, Edge } from '@xyflow/react'
import type { GraphNode, GraphEdge, NodeStatus, NodeType } from '@/lib/types'
import { NODE_TYPE_COLORS, STATUS_COLORS, EDGE_STYLES } from '@/lib/constants'

export interface WorkflowNodeData {
  label: string
  nodeType: NodeType
  status: NodeStatus
  priority: number
  xpSize?: string
  sprint?: string | null
  sourceNode: GraphNode
  hasChildren: boolean
  isExpanded: boolean
  childCount: number
  onExpand?: (nodeId: string) => void
  [key: string]: unknown
}

export interface WorkflowEdgeData {
  relationType: string
  [key: string]: unknown
}

const NODE_WIDTH = 240
const NODE_HEIGHT = 80

/** toFlowNodes — auto-generated description placeholder. */
export function toFlowNodes(
  nodes: GraphNode[],
  filters?: { statuses?: Set<string>; types?: Set<string>; sprints?: Set<string> },
  childrenMap?: Map<string, string[]>,
  expandedIds?: Set<string>,
  onExpand?: (nodeId: string) => void,
): Node<WorkflowNodeData>[] {
  return nodes
    .filter((n) => {
      if (filters?.statuses?.size && !filters.statuses.has(n.status)) return false
      if (filters?.types?.size && !filters.types.has(n.type)) return false
      if (filters?.sprints?.size && !filters.sprints.has(n.sprint ?? '')) return false
      return true
    })
    .map((n) => {
      const children = childrenMap?.get(n.id)
      const hasChildren = children != null && children.length > 0
      return {
        id: n.id,
        type: 'workflowNode',
        position: { x: 0, y: 0 },
        data: {
          label: n.title,
          nodeType: n.type,
          status: n.status,
          priority: n.priority,
          xpSize: n.xpSize,
          sprint: n.sprint,
          sourceNode: n,
          hasChildren,
          isExpanded: expandedIds?.has(n.id) ?? false,
          childCount: children?.length ?? 0,
          onExpand,
        },
        style: {
          width: NODE_WIDTH,
          borderLeft: `4px solid ${NODE_TYPE_COLORS[n.type] || '#6c757d'}`,
        },
      }
    })
}

/** toFlowEdges — auto-generated description placeholder. */
export function toFlowEdges(edges: GraphEdge[], visibleNodeIds: Set<string>): Edge<WorkflowEdgeData>[] {
  return edges
    .filter((e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to))
    .map((e) => {
      const style = EDGE_STYLES[e.relationType] || EDGE_STYLES.related_to
      return {
        id: e.id,
        source: e.from,
        target: e.to,
        label: style.label,
        type: 'workflowEdge',
        data: { relationType: e.relationType },
        style: {
          stroke: style.color,
          strokeDasharray: style.dashed ? '5 5' : undefined,
        },
        labelStyle: { fontSize: 10, fill: '#6c757d' },
      }
    })
}

/**
 * Deterministic numeric hash for layout cache key.
 * Avoids O(n) string concatenation — uses incremental char-code hashing.
 */
export function computeLayoutKey(nodeIds: string[], edgePairs: string[], direction: string): number {
  let hash = 0
  const parts = [direction, ...nodeIds, '|', ...edgePairs]
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      hash = ((hash << 5) - hash + part.charCodeAt(i)) | 0
    }
  }
  return hash
}

/**
 * Returns true if layout recalculation can be skipped (same visible node IDs).
 */
export function shouldSkipLayout(prevIds: string[] | null, nextIds: string[]): boolean {
  if (prevIds === null) return false
  if (prevIds.length !== nextIds.length) return false
  for (let i = 0; i < prevIds.length; i++) {
    if (prevIds[i] !== nextIds[i]) return false
  }
  return true
}

// Layout cache stores only computed positions (not node objects with callbacks)
// so multiple tabs sharing the same node IDs get correct layout without stale closures.
let layoutCache: {
  key: number
  positions: Map<string, { x: number; y: number }>
} | null = null

/** applyDagreLayout — auto-generated description placeholder. */
export function applyDagreLayout(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge<WorkflowEdgeData>[],
  direction: 'TB' | 'LR' = 'TB',
): { nodes: Node<WorkflowNodeData>[]; edges: Edge<WorkflowEdgeData>[] } {
  const nodeIds = nodes.map((n) => n.id)
  const edgePairs = edges.map((e) => `${e.source}-${e.target}`)
  const cacheKey = computeLayoutKey(nodeIds, edgePairs, direction)

  let positions: Map<string, { x: number; y: number }>

  if (layoutCache && layoutCache.key === cacheKey) {
    positions = layoutCache.positions
  } else {
    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({ rankdir: direction, ranksep: 60, nodesep: 40 })

    for (const node of nodes) {
      g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
    }

    for (const edge of edges) {
      g.setEdge(edge.source, edge.target)
    }

    dagre.layout(g)

    positions = new Map()
    for (const node of nodes) {
      const pos = g.node(node.id)
      positions.set(node.id, {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      })
    }

    layoutCache = { key: cacheKey, positions }
  }

  const layoutedNodes = nodes.map((node) => {
    const pos = positions.get(node.id) ?? { x: 0, y: 0 }
    return { ...node, position: pos }
  })

  return { nodes: layoutedNodes, edges }
}

/**
 * Grid layout for the clean default view: disconnected root cards (epics) have no
 * edges between them, so dagre/ELK pack them into a single unreadable row. A grid
 * arranges them as a tidy card wall (~sqrt columns) — modern and scannable.
 */
export function applyGridLayout(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge<WorkflowEdgeData>[],
): { nodes: Node<WorkflowNodeData>[]; edges: Edge<WorkflowEdgeData>[] } {
  const GAP_X = 60
  const GAP_Y = 50
  const cols = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(nodes.length))))
  const layoutedNodes = nodes.map((node, i) => ({
    ...node,
    position: {
      x: (i % cols) * (NODE_WIDTH + GAP_X),
      y: Math.floor(i / cols) * (NODE_HEIGHT + GAP_Y),
    },
  }))
  return { nodes: layoutedNodes, edges }
}

export { NODE_TYPE_COLORS, STATUS_COLORS }

// ── Layout Engine types ──────────────────────────────────────────────────────

export type LayoutEngine = 'dagre' | 'elk'

export interface ElkChild {
  id: string
  width?: number
  height?: number
  x?: number
  y?: number
}

export interface ElkEdge {
  id: string
  sources: string[]
  targets: string[]
}

export interface ElkGraph {
  id: string
  children: ElkChild[]
  edges: ElkEdge[]
  layoutOptions?: Record<string, string>
}

// ── repairElkInput ───────────────────────────────────────────────────────────

/**
 * Cleans up an ELK input graph before layout:
 * - fills missing node dimensions with defaults
 * - removes duplicate child ids
 * - drops orphan edges (referencing non-existent nodes)
 *
 * Returns the repaired graph and a list of human-readable issue strings.
 */
export function repairElkInput(input: ElkGraph): { input: ElkGraph; issues: string[] } {
  const issues: string[] = []

  // 1. Fill missing dimensions
  let dimsAdded = 0
  const children = input.children.map((c) => {
    if (c.width == null || c.height == null) {
      dimsAdded++
      return { ...c, width: c.width ?? NODE_WIDTH, height: c.height ?? NODE_HEIGHT }
    }
    return c
  })
  if (dimsAdded > 0) {
    issues.push(`Set default dimensions on ${dimsAdded} node(s) missing width/height.`)
  }

  // 2. Deduplicate child ids
  const seen = new Set<string>()
  let dupsRemoved = 0
  const deduped = children.filter((c) => {
    if (seen.has(c.id)) {
      dupsRemoved++
      return false
    }
    seen.add(c.id)
    return true
  })
  if (dupsRemoved > 0) {
    issues.push(`Removed ${dupsRemoved} duplicate child id(s).`)
  }

  // 3. Drop orphan edges
  const allIds = new Set(deduped.map((c) => c.id))
  let orphanEdges = 0
  const edges = input.edges.filter((e) => {
    const ok = e.sources.every((s) => allIds.has(s)) && e.targets.every((t) => allIds.has(t))
    if (!ok) orphanEdges++
    return ok
  })
  if (orphanEdges > 0) {
    issues.push(`Dropped ${orphanEdges} orphan edge(s) referencing nonexistent nodes.`)
  }

  return { input: { ...input, children: deduped, edges }, issues }
}

// ── applyElkLayout ───────────────────────────────────────────────────────────

const ELK_LAYOUT_OPTIONS: Record<string, string> = {
  algorithm: 'layered',
  'elk.direction': 'DOWN',
  'elk.layered.spacing.nodeNodeBetweenLayers': '80',
  'elk.spacing.nodeNode': '60',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.padding': '[top=40,left=20,right=20,bottom=20]',
}

/**
 * Async ELK layout — produces non-overlapping positions for large graphs (>100 nodes).
 * Falls back to dagre positions on ELK failure so the caller always gets a valid graph.
 */
export async function applyElkLayout(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge<WorkflowEdgeData>[],
): Promise<{ nodes: Node<WorkflowNodeData>[]; edges: Edge<WorkflowEdgeData>[] }> {
  if (nodes.length === 0) return { nodes, edges }

  const raw: ElkGraph = {
    id: 'root',
    layoutOptions: ELK_LAYOUT_OPTIONS,
    children: nodes.map((n) => ({
      id: n.id,
      width: (n.style?.width as number | undefined) ?? NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: edges.map((e, i) => ({
      id: e.id ?? `elk-e${i}`,
      sources: [String(e.source)],
      targets: [String(e.target)],
    })),
  }

  const { input: repaired } = repairElkInput(raw)

  try {
    const { default: ELK } = await import('elkjs/lib/elk.bundled.js')
    const elk = new ELK()
    const positioned = (await elk.layout(
      repaired as unknown as Parameters<typeof elk.layout>[0],
    )) as unknown as ElkGraph

    const posMap = new Map<string, { x: number; y: number }>()
    for (const c of positioned.children ?? []) {
      posMap.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 })
    }

    return {
      nodes: nodes.map((n) => {
        const pos = posMap.get(n.id) ?? n.position
        return { ...n, position: pos }
      }),
      edges,
    }
  } catch {
    // ELK unavailable — fall back to dagre so UI stays functional
    return applyDagreLayout(nodes, edges)
  }
}
