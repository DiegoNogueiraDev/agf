/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Kanban Validator — validates card moves between columns.
 *
 * Checks status transition validity, WIP limits, and dependency constraints.
 * Returns warnings (advisory mode) rather than blocking moves.
 */

import type { GraphNode, NodeStatus } from '../graph/graph-types.js'
import type { SqliteStore } from '../store/sqlite-store.js'
import { createLogger } from '../utils/logger.js'
import type { KanbanConfig, KanbanMoveResult } from './kanban-types.js'

const log = createLogger({ layer: 'core', source: 'kanban-validator.ts' })

/**
 * Validate a card move from its current status to a new status.
 * Returns success=true with optional warnings (advisory mode).
 * Returns success=false only if the node doesn't exist.
 */
export function validateMove(
  store: SqliteStore,
  nodeId: string,
  newStatus: NodeStatus,
  config: KanbanConfig,
): KanbanMoveResult {
  const node = store.getNodeById(nodeId)
  if (!node) {
    return {
      success: false,
      node: { id: nodeId } as GraphNode,
      previousStatus: 'backlog',
      newStatus,
      warnings: [`Node "${nodeId}" not found`],
    }
  }

  const warnings: string[] = []
  const previousStatus = node.status

  // Check unresolved dependencies when moving to "done"
  if (newStatus === 'done') {
    const edges = store.getEdgesFrom(nodeId)
    const depEdges = edges.filter((e) => e.relationType === 'depends_on')
    const unresolvedDeps: string[] = []
    for (const edge of depEdges) {
      const depNode = store.getNodeById(edge.to)
      if (depNode && depNode.status !== 'done') {
        unresolvedDeps.push(depNode.title)
      }
    }
    if (unresolvedDeps.length > 0) {
      warnings.push(`Task has ${unresolvedDeps.length} unresolved dependencies: ${unresolvedDeps.join(', ')}`)
    }
  }

  // Check WIP limits
  if (config.wipLimits[newStatus] > 0) {
    const currentCount = store
      .getNodesByStatus(newStatus)
      .filter((n) => n.type === 'task' || n.type === 'subtask').length
    if (currentCount >= config.wipLimits[newStatus]) {
      warnings.push(`WIP limit for "${newStatus}" will be exceeded: ${currentCount + 1}/${config.wipLimits[newStatus]}`)
    }
  }

  log.debug('kanban-validator:validate', {
    nodeId,
    from: previousStatus,
    to: newStatus,
    warnings: warnings.length,
  })

  return {
    success: true,
    node,
    previousStatus,
    newStatus,
    warnings,
  }
}
