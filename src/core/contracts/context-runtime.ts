/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Contract: ContextRuntimeService
 *
 * Core service interface for graph context queries with flow dilution.
 * Pure TypeScript contract — zero vendor imports.
 */

import type { GraphNode } from '../graph/graph-types.js'
import type { FlowCompactResult } from '../context/flow-compact.js'

export interface GraphSummary {
  byType: Record<string, number>
  byStatus: Record<string, number>
  totalNodes: number
  nextTask: { id: string; title: string } | null
}

export interface NodeDetail {
  node: GraphNode
  childrenCount: number
  parentTitle?: string
  edgeCount: number
}

/**
 * Contract for graph context queries.
 *
 * Every `compact` call MUST go through `applyFlowToCompact` for flow
 * dilution. The `flow_off` arm preserves exact legacy behavior.
 * Implementations must not import vendor SDKs or MCP types.
 */
export interface ContextRuntimeService {
  /**
   * Build flow-diluted context for a task node.
   *
   * Delegates to `applyFlowToCompact(store, nodeId)` internally.
   * Returns `null` when flow is disabled (caller falls through to legacy)
   * or when the node does not exist.
   *
   * @param nodeId - The task node to build context for.
   * @returns The flow-compacted context, or `null`.
   */
  compact(nodeId: string): FlowCompactResult | null

  /**
   * Return a high-level summary of the graph: counts by type and status,
   * total nodes, and the next recommended task.
   *
   * @returns The graph summary.
   */
  summary(): GraphSummary

  /**
   * Return detailed information about a single node.
   *
   * @param nodeId - The node to inspect.
   * @returns The node detail, or `null` if not found.
   */
  nodeDetail(nodeId: string): NodeDetail | null

  /**
   * List the direct children of a node.
   *
   * @param nodeId - The parent node ID.
   * @returns The child nodes (empty array if none).
   */
  children(nodeId: string): GraphNode[]

  /**
   * List all backlog items ordered by priority (ascending) then creation
   * time (ascending). This is the raw backlog — no task selection logic.
   *
   * @returns Backlog nodes.
   */
  backlog(): GraphNode[]
}
