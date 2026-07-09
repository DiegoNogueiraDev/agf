/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Contract: TaskLifecycleService
 *
 * Core service interface for task lifecycle operations. Pure TypeScript contract
 * with zero vendor imports. Implementations may use SqliteStore, in-memory
 * fakes, or any persistence backend — the contract stays the same.
 */

import type { GraphNode, NodeStatus } from '../graph/graph-types.js'

export interface DoDCheck {
  name: string
  severity?: 'required' | 'recommended'
  passed: boolean
  detail: string
}

export interface DoDReport {
  nodeId: string
  title: string
  checks: DoDCheck[]
  passed: number
  total: number
  ready: boolean
  epicPromotion?: {
    parentId: string
    parentTitle: string
    allChildrenDone: boolean
    /** True when a child has ≥1 required completeness gap (checkEpicPromotionGate). */
    blocked?: boolean
    requiredGapCount?: number
  }
}

import type { ArtifactEdit } from '../reuse/artifact-cache.js'

export interface TaskContext {
  node: GraphNode
  acceptanceCriteria: string[]
  children: GraphNode[]
  blockers: GraphNode[]
  dependsOn: { nodeId: string; title: string; status: NodeStatus; resolved: boolean }[]
  /** Reuse hints from artifact cache — exact edits from a previous
   *  successful run of a task with the same signature. */
  reuseHint?: { edits: ArtifactEdit[]; sourceId: string }
}

/**
 * Contract for task lifecycle operations.
 *
 * Implementations must be pure in their public API (no side effects beyond
 * the persistence layer) and must never import vendor SDKs or MCP types.
 */
export interface TaskLifecycleService {
  /**
   * Start a task: find the next available or start a specific one.
   * Marks the task `in_progress` and returns its full context.
   * The returned context SHOULD be flow-diluted when the flow engine
   * is active (see `applyFlowToCompact`).
   *
   * @param nodeId - Optional specific task ID to start. If omitted, pulls
   *   the highest-priority backlog task (pull system — WIP=1).
   * @returns The task context, or `null` if no task is available.
   */
  startTask(nodeId?: string): TaskContext | null

  /**
   * Finish a task: validate Definition of Done, mark `done`, check for
   * epic promotion, and return the DoD report.
   *
   * Must run all required DoD checks (has_acceptance_criteria,
   * ac_quality_pass, no_unresolved_blockers, status_flow_valid, and
   * recommended checks) before transitioning to `done`.
   *
   * @param nodeId - The task node ID to finish.
   * @param rationale - Human-readable explanation of what was implemented.
   * @param testFiles - Paths to test files created or modified.
   * @returns The DoD report. If checks fail, the task stays `in_progress`.
   */
  finishTask(nodeId: string, rationale?: string, testFiles?: string[]): DoDReport

  /**
   * Update a node's status with optional transition validation.
   *
   * @param nodeId - The node to update.
   * @param status - The new status. Transition validation may apply
   *   (e.g., `done` requires passing `in_progress` first).
   * @param options.skipHooks - When true, bypasses enforcement hooks
   *   (e.g. `status:pre-change`'s TDD guard). Wire this from `--force`.
   * @returns The updated node, or `null` if not found.
   */
  updateStatus(nodeId: string, status: NodeStatus, options?: { skipHooks?: boolean }): GraphNode | null

  /**
   * Find the next available task (pull system — highest priority, no blockers).
   *
   * @returns The next task node, or `null` if the backlog is empty.
   */
  findNext(): GraphNode | null
}
