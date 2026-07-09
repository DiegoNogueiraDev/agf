/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Kanban Board Builder — transforms a GraphDocument into a KanbanBoard.
 *
 * Groups nodes by status into columns, computes blockers/dependencies,
 * identifies the next task, builds swimlanes, and calculates flow metrics.
 * Deterministic — no LLM calls, pure graph traversal.
 */

import type { GraphDocument, GraphNode, NodeStatus } from '../graph/graph-types.js'
import { findNextTask } from '../planner/next-task.js'
import { XP_SIZE_ORDER } from '../utils/xp-sizing.js'
import { createLogger } from '../utils/logger.js'
import {
  COLUMN_ORDER,
  COLUMN_TITLES,
  type KanbanBoard,
  type KanbanCard,
  type KanbanColumn,
  type KanbanConfig,
  type KanbanMetrics,
  type KanbanSwimlane,
  type WipViolation,
} from './kanban-types.js'

const log = createLogger({ layer: 'core', source: 'kanban-builder.ts' })

/**
 * Build a full KanbanBoard from a GraphDocument and configuration.
 */
export function buildKanbanBoard(doc: GraphDocument, config: KanbanConfig): KanbanBoard {
  log.debug('kanban-builder:build', { nodes: doc.nodes.length, edges: doc.edges.length })

  const filteredNodes = filterNodes(doc.nodes, config)
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]))
  const doneIds = new Set(doc.nodes.filter((n) => n.status === 'done').map((n) => n.id))

  // Find next task
  const nextResult = findNextTask(doc)
  const nextId = nextResult?.node.id ?? null

  // Build cards with computed metadata
  const cards = filteredNodes.map((node) => buildCard(node, doc, nodeMap, doneIds, nextId))

  // Group into columns
  const columns = buildColumns(cards, config)

  // Build swimlanes
  const swimlanes = buildSwimlanes(filteredNodes, nodeMap, config)

  // Compute metrics
  const metrics = computeMetrics(columns, doc, config)

  return { columns, swimlanes, metrics }
}

function filterNodes(nodes: GraphNode[], config: KanbanConfig): GraphNode[] {
  if (config.showOnlyTasks) {
    return nodes.filter((n) => n.type === 'task' || n.type === 'subtask')
  }
  return [...nodes]
}

function buildCard(
  node: GraphNode,
  doc: GraphDocument,
  nodeMap: Map<string, GraphNode>,
  doneIds: Set<string>,
  nextId: string | null,
): KanbanCard {
  // Count total dependencies (depends_on edges from this node)
  const depEdges = doc.edges.filter((e) => e.from === node.id && e.relationType === 'depends_on')
  const dependencyCount = depEdges.length

  // Count unresolved blockers (depends_on targets that aren't done)
  const blockerCount = depEdges.filter((e) => !doneIds.has(e.to)).length

  // Resolve epic title from parent
  let epicTitle: string | undefined
  if (node.parentId) {
    const parent = nodeMap.get(node.parentId)
    if (parent && parent.type === 'epic') {
      epicTitle = parent.title
    }
  }

  return {
    node,
    blockerCount,
    dependencyCount,
    isNext: node.id === nextId,
    epicTitle,
  }
}

function buildColumns(cards: KanbanCard[], config: KanbanConfig): KanbanColumn[] {
  const byStatus = new Map<NodeStatus, KanbanCard[]>()
  for (const status of COLUMN_ORDER) {
    byStatus.set(status, [])
  }

  for (const card of cards) {
    const list = byStatus.get(card.node.status)
    if (list) {
      list.push(card)
    }
  }

  // Sort cards within each column: priority ASC, then XP size ASC
  for (const list of byStatus.values()) {
    list.sort((a, b) => {
      if (a.node.priority !== b.node.priority) return a.node.priority - b.node.priority
      const sizeA = XP_SIZE_ORDER[a.node.xpSize ?? 'M'] ?? 3
      const sizeB = XP_SIZE_ORDER[b.node.xpSize ?? 'M'] ?? 3
      return sizeA - sizeB
    })
  }

  return COLUMN_ORDER.map((status) => ({
    status,
    title: COLUMN_TITLES[status],
    wipLimit: config.wipLimits[status],
    cards: byStatus.get(status) ?? [],
  }))
}

function buildSwimlanes(nodes: GraphNode[], nodeMap: Map<string, GraphNode>, config: KanbanConfig): KanbanSwimlane[] {
  if (config.swimlaneMode === 'none') return []

  const lanes = new Map<string, { label: string; nodeIds: string[] }>()

  if (config.swimlaneMode === 'epic') {
    for (const node of nodes) {
      if (!node.parentId) continue
      const parent = nodeMap.get(node.parentId)
      if (!parent || parent.type !== 'epic') continue

      const existing = lanes.get(parent.id)
      if (existing) {
        existing.nodeIds.push(node.id)
      } else {
        lanes.set(parent.id, { label: parent.title, nodeIds: [node.id] })
      }
    }

    // Add ungrouped lane for tasks without epic parent
    const ungrouped = nodes.filter((n) => {
      if (!n.parentId) return true
      const parent = nodeMap.get(n.parentId)
      return !parent || parent.type !== 'epic'
    })
    if (ungrouped.length > 0) {
      lanes.set('__ungrouped__', { label: 'Ungrouped', nodeIds: ungrouped.map((n) => n.id) })
    }
  } else if (config.swimlaneMode === 'sprint') {
    for (const node of nodes) {
      const sprint = node.sprint ?? '__unassigned__'
      const label = sprint === '__unassigned__' ? 'No Sprint' : sprint

      const existing = lanes.get(sprint)
      if (existing) {
        existing.nodeIds.push(node.id)
      } else {
        lanes.set(sprint, { label, nodeIds: [node.id] })
      }
    }
  }

  return Array.from(lanes.entries()).map(([id, data]) => ({
    id,
    label: data.label,
    nodeIds: data.nodeIds,
  }))
}

function computeMetrics(columns: KanbanColumn[], doc: GraphDocument, _config: KanbanConfig): KanbanMetrics {
  // WIP violations
  const wipViolations: WipViolation[] = []
  for (const col of columns) {
    if (col.wipLimit > 0 && col.cards.length > col.wipLimit) {
      wipViolations.push({
        column: col.status,
        limit: col.wipLimit,
        actual: col.cards.length,
      })
    }
  }

  // Throughput: count of done tasks
  const tasks = doc.nodes.filter((n) => n.type === 'task' || n.type === 'subtask')
  const doneTasks = tasks.filter((n) => n.status === 'done')
  const throughput = doneTasks.length

  // Avg cycle time (in_progress → done, in hours)
  let totalCycleTime = 0
  let cycleCount = 0
  for (const task of doneTasks) {
    const updated = new Date(task.updatedAt).getTime()
    const created = new Date(task.createdAt).getTime()
    if (updated > created) {
      totalCycleTime += (updated - created) / (1000 * 60 * 60)
      cycleCount++
    }
  }
  const avgCycleTime = cycleCount > 0 ? Math.round((totalCycleTime / cycleCount) * 10) / 10 : 0

  // Avg lead time (created → done, in hours) — same as cycle time with our data
  const avgLeadTime = avgCycleTime

  // Blocked percentage
  const blockedTasks = tasks.filter((n) => n.status === 'blocked' || n.blocked)
  const blockedPercentage = tasks.length > 0 ? Math.round((blockedTasks.length / tasks.length) * 100) : 0

  return {
    wipViolations,
    throughput,
    avgCycleTime,
    avgLeadTime,
    blockedPercentage,
  }
}
