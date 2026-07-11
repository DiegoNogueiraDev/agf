/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { GraphNode, GraphEdge, NodeStatus, NodeType } from './graph-types.js'

export interface MermaidExportOptions {
  format?: 'flowchart' | 'mindmap' | 'gantt' | 'stateDiagram'
  filterStatus?: NodeStatus[]
  filterType?: NodeType[]
  direction?: 'TD' | 'TB' | 'LR' | 'BT' | 'RL'
  includeEdgeLabels?: boolean
}

const STATUS_COLORS: Record<NodeStatus, string> = {
  done: '#4caf50',
  in_progress: '#2196f3',
  blocked: '#f44336',
  backlog: '#9e9e9e',
  ready: '#ff9800',
  quarantined: '#9c27b0',
  satisfied: '#00bcd4',
}

const DASHED_RELATIONS = new Set(['depends_on', 'blocks', 'related_to'])

function escapeMermaid(text: string): string {
  return text.replace(/"/g, "'")
}

const REDUNDANT_EDGE_TYPES = new Set(['child_of'])

/** Filter graph nodes by status, type, and/or root scope before Mermaid export. */
export function filterNodes(nodes: GraphNode[], options?: MermaidExportOptions): GraphNode[] {
  let filtered = nodes
  if (options?.filterStatus && options.filterStatus.length > 0) {
    const statuses = new Set(options.filterStatus)
    filtered = filtered.filter((n) => statuses.has(n.status))
  }
  if (options?.filterType && options.filterType.length > 0) {
    const types = new Set(options.filterType)
    filtered = filtered.filter((n) => types.has(n.type))
  }
  return filtered
}

const MINUTES_PER_DAY = 480
const DEFAULT_DURATION_DAYS = 3

function sanitizeGanttTitle(text: string): string {
  return text.replace(/[:#;!'"]/g, '').trim()
}

function ganttStatusPrefix(status: NodeStatus): string {
  if (status === 'done') return 'done, '
  if (status === 'in_progress') return 'active, '
  return ''
}

function estimateToDays(estimateMinutes?: number): number {
  if (estimateMinutes == null) return DEFAULT_DURATION_DAYS
  const days = Math.ceil(estimateMinutes / MINUTES_PER_DAY)
  return Math.max(days, 1)
}

function extractDate(isoString: string): string {
  return isoString.slice(0, 10)
}

function buildGantt(nodes: GraphNode[], edges: GraphEdge[]): string {
  const lines: string[] = ['gantt', '    dateFormat YYYY-MM-DD', '    title Sprint Timeline']

  // Group nodes by sprint
  const sprintMap = new Map<string, GraphNode[]>()
  for (const node of nodes) {
    const sprint = node.sprint ?? 'Unassigned'
    const group = sprintMap.get(sprint) ?? []
    group.push(node)
    sprintMap.set(sprint, group)
  }

  // Build dependency map: nodeId -> list of dependency nodeIds (what it depends on)
  const dependsOn = new Map<string, string[]>()
  for (const edge of edges) {
    if (edge.relationType === 'depends_on') {
      const deps = dependsOn.get(edge.from) ?? []
      deps.push(edge.to)
      dependsOn.set(edge.from, deps)
    }
  }

  const nodeIds = new Set(nodes.map((n) => n.id))

  for (const [sprint, sprintNodes] of sprintMap) {
    lines.push(`    section ${sprint}`)
    for (const node of sprintNodes) {
      const title = sanitizeGanttTitle(node.title)
      const statusPrefix = ganttStatusPrefix(node.status)
      const days = estimateToDays(node.estimateMinutes)

      // Check if this node has dependencies within the current node set
      const deps = (dependsOn.get(node.id) ?? []).filter((d) => nodeIds.has(d))

      let startClause: string
      if (deps.length > 0) {
        // E5-T06: sanitize IDs to prevent Gantt syntax errors from colons
        startClause = `after ${deps.map((d) => d.replace(/[^a-zA-Z0-9_]/g, '_')).join(' ')}`
      } else {
        startClause = extractDate(node.createdAt)
      }

      // E5-T06: sanitize node.id for Gantt syntax (colons break parsing)
      const ganttId = node.id.replace(/[^a-zA-Z0-9_]/g, '_')
      lines.push(`    ${title} :${statusPrefix}${ganttId}, ${startClause}, ${days}d`)
    }
  }

  return lines.join('\n') + '\n'
}

function buildMindmap(nodes: GraphNode[]): string {
  const lines: string[] = ['mindmap']

  const childrenMap = new Map<string | undefined, GraphNode[]>()
  for (const node of nodes) {
    const parentKey = node.parentId ?? undefined
    const children = childrenMap.get(parentKey) ?? []
    children.push(node)
    childrenMap.set(parentKey, children)
  }

  function renderNode(node: GraphNode, depth: number): void {
    const indent = '  '.repeat(depth)
    lines.push(`${indent}${escapeMermaid(node.title)}`)
    const children = childrenMap.get(node.id) ?? []
    for (const child of children) {
      renderNode(child, depth + 1)
    }
  }

  const roots = childrenMap.get(undefined) ?? []
  for (const root of roots) {
    renderNode(root, 1)
  }

  return lines.join('\n') + '\n'
}

function sanitizeStateName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_')
}

function buildStateDiagram(nodes: GraphNode[], _edges: GraphEdge[]): string {
  const stateMachines = nodes.filter((n) => n.type === 'state_machine')
  if (stateMachines.length === 0) {
    return 'stateDiagram-v2\n    [*] --> Empty : No state machines found'
  }

  const lines: string[] = ['stateDiagram-v2']

  for (const machine of stateMachines) {
    const meta = machine.metadata as Record<string, unknown> | undefined
    if (!meta) continue

    const states = (meta.states as string[]) ?? []
    const transitions = (meta.transitions as Array<{ from: string; to: string; trigger?: string }>) ?? []
    const initialState = (meta.initialState as string) ?? states[0]

    lines.push(`    %% ${escapeMermaid(machine.title)}`)

    // Initial state
    if (initialState) {
      lines.push(`    [*] --> ${sanitizeStateName(initialState)}`)
    }

    // Transitions
    for (const tVar of transitions) {
      const label = tVar.trigger ? ` : ${tVar.trigger}` : ''
      lines.push(`    ${sanitizeStateName(tVar.from)} --> ${sanitizeStateName(tVar.to)}${label}`)
    }

    lines.push('')
  }

  return lines.join('\n')
}

/** Convert graph nodes and edges into a Mermaid flowchart diagram string. */
export function graphToMermaid(nodes: GraphNode[], edges: GraphEdge[], options?: MermaidExportOptions): string {
  const filteredNodes = filterNodes(nodes, options)

  if (options?.format === 'gantt') {
    return buildGantt(filteredNodes, edges)
  }

  if (options?.format === 'mindmap') {
    return buildMindmap(filteredNodes)
  }

  if (options?.format === 'stateDiagram') {
    return buildStateDiagram(filteredNodes, edges)
  }

  const direction = options?.direction ?? 'TD'
  const lines: string[] = [`graph ${direction}`]

  if (filteredNodes.length === 0) {
    return lines.join('\n') + '\n'
  }

  const nodeIds = new Set(filteredNodes.map((n) => n.id))

  for (const node of filteredNodes) {
    lines.push(`  ${node.id}["${escapeMermaid(node.title)}"]`)
  }

  const renderedEdges = new Set<string>()
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue
    if (REDUNDANT_EDGE_TYPES.has(edge.relationType)) continue

    const edgeKey = `${edge.from}-${edge.to}-${edge.relationType}`
    if (renderedEdges.has(edgeKey)) continue
    renderedEdges.add(edgeKey)

    const arrow = DASHED_RELATIONS.has(edge.relationType) ? '-.->' : '-->'
    const label = options?.includeEdgeLabels === false ? '' : `|${edge.relationType}|`
    lines.push(`  ${edge.from} ${arrow}${label} ${edge.to}`)
  }

  for (const node of filteredNodes) {
    const color = STATUS_COLORS[node.status]
    if (color) {
      lines.push(`  style ${node.id} fill:${color}`)
    }
  }

  return lines.join('\n') + '\n'
}
