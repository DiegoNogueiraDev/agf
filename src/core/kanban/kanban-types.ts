/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Kanban Orchestrator — type definitions.
 *
 * All types for the Kanban board visualization, orchestration,
 * and move validation. Built on top of existing GraphNode/GraphEdge types.
 */

import type { GraphNode, NodeStatus } from '../graph/graph-types.js'

/** A single card on the Kanban board, wrapping a GraphNode with computed metadata. */
export interface KanbanCard {
  node: GraphNode
  blockerCount: number
  dependencyCount: number
  isNext: boolean
  epicTitle?: string
}

/** A status column on the Kanban board. */
export interface KanbanColumn {
  status: NodeStatus
  title: string
  wipLimit: number
  cards: KanbanCard[]
}

/** A WIP limit violation for a specific column. */
export interface WipViolation {
  column: NodeStatus
  limit: number
  actual: number
}

/** Aggregate Kanban flow metrics. */
export interface KanbanMetrics {
  wipViolations: WipViolation[]
  throughput: number
  avgCycleTime: number
  avgLeadTime: number
  blockedPercentage: number
}

/** A horizontal swimlane grouping cards by epic or sprint. */
export interface KanbanSwimlane {
  id: string
  label: string
  nodeIds: string[]
}

/** The full Kanban board state. */
export interface KanbanBoard {
  columns: KanbanColumn[]
  swimlanes: KanbanSwimlane[]
  metrics: KanbanMetrics
}

/** Swimlane grouping mode. */
export type SwimlaneMode = 'epic' | 'sprint' | 'none'

/** User-configurable Kanban settings. */
export interface KanbanConfig {
  wipLimits: Record<NodeStatus, number>
  swimlaneMode: SwimlaneMode
  showOnlyTasks: boolean
}

/** Default WIP limits per status column. */
export const DEFAULT_WIP_LIMITS: Record<NodeStatus, number> = {
  backlog: 0,
  ready: 10,
  in_progress: 3,
  blocked: 0,
  done: 0,
  quarantined: 0,
  satisfied: 0,
}

/** Default Kanban configuration. */
export const DEFAULT_KANBAN_CONFIG: KanbanConfig = {
  wipLimits: { ...DEFAULT_WIP_LIMITS },
  swimlaneMode: 'none',
  showOnlyTasks: true,
}

/** Result of a card move operation. */
export interface KanbanMoveResult {
  success: boolean
  node: GraphNode
  previousStatus: NodeStatus
  newStatus: NodeStatus
  warnings: string[]
}

/** An orchestration suggestion for the user. */
export interface KanbanSuggestion {
  nodeId: string
  nodeTitle: string
  action: string
  reason: string
  priority: number
}

/** Column display order. */
export const COLUMN_ORDER: readonly NodeStatus[] = [
  'backlog',
  'ready',
  'in_progress',
  'blocked',
  'done',
  'quarantined',
] as const

/** Human-readable column titles. */
export const COLUMN_TITLES: Record<NodeStatus, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
  quarantined: 'Quarantine',
  satisfied: 'Satisfied',
}
