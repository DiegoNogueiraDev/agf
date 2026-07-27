/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Kanban Orchestrator — generates smart suggestions for board management.
 *
 * All logic is deterministic (no LLM calls). Uses graph traversal to:
 * - Auto-promote tasks whose dependencies are resolved
 * - Detect unblockable tasks
 * - Warn on WIP violations
 * - Alert on bottleneck accumulation
 * - Surface the recommended next task
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { findNextTask } from '../planner/next-task.js'
import { createLogger } from '../utils/logger.js'
import type { KanbanBoard, KanbanSuggestion } from './kanban-types.js'

const log = createLogger({ layer: 'core', source: 'kanban-orchestrator.ts' })

/** Threshold: if blocked tasks exceed this fraction of total tasks, alert. */
const BOTTLENECK_THRESHOLD = 0.3
/** Minimum blocked count to trigger bottleneck alert. */
const BOTTLENECK_MIN_COUNT = 3

/**
 * Generate orchestration suggestions based on the current board state.
 */
export function generateSuggestions(doc: GraphDocument, board: KanbanBoard): KanbanSuggestion[] {
  const suggestions: KanbanSuggestion[] = []
  const doneIds = new Set(doc.nodes.filter((n) => n.status === 'done').map((n) => n.id))

  // 1. Auto-promote: backlog tasks with all deps resolved → suggest "ready"
  const backlogCol = board.columns.find((c) => c.status === 'backlog')
  if (backlogCol) {
    for (const card of backlogCol.cards) {
      if (card.blockerCount === 0 && card.dependencyCount > 0) {
        // Has deps but all are resolved
        suggestions.push({
          nodeId: card.node.id,
          nodeTitle: card.node.title,
          action: 'promote_ready',
          reason: `All dependencies resolved — ready to start`,
          priority: 2,
        })
      }
    }
  }

  // 2. Unblock detection: blocked tasks whose deps are now all done
  const blockedCol = board.columns.find((c) => c.status === 'blocked')
  if (blockedCol) {
    for (const card of blockedCol.cards) {
      const depEdges = doc.edges.filter((e) => e.from === card.node.id && e.relationType === 'depends_on')
      const allDepsResolved = depEdges.length > 0 && depEdges.every((e) => doneIds.has(e.to))
      // Also check if the node was just flagged blocked but deps are now clear
      if (allDepsResolved || (depEdges.length === 0 && card.node.blocked)) {
        suggestions.push({
          nodeId: card.node.id,
          nodeTitle: card.node.title,
          action: 'unblock',
          reason: `All blockers resolved — can be moved back to ready`,
          priority: 1,
        })
      }
    }
  }

  // 3. WIP violations
  for (const violation of board.metrics.wipViolations) {
    suggestions.push({
      nodeId: '',
      nodeTitle: '',
      action: 'wip_violation',
      reason: `WIP limit exceeded for "${violation.column}": ${violation.actual}/${violation.limit}. Finish current work before starting new tasks.`,
      priority: 1,
    })
  }

  // 4. Bottleneck alert: too many blocked tasks
  if (blockedCol) {
    const totalTasks = board.columns.reduce((sum, c) => sum + c.cards.length, 0)
    const blockedCount = blockedCol.cards.length
    if (blockedCount >= BOTTLENECK_MIN_COUNT && totalTasks > 0 && blockedCount / totalTasks >= BOTTLENECK_THRESHOLD) {
      suggestions.push({
        nodeId: '',
        nodeTitle: '',
        action: 'bottleneck_alert',
        reason: `${blockedCount} tasks blocked (${Math.round((blockedCount / totalTasks) * 100)}% of total). Focus on resolving blockers before adding new work.`,
        priority: 1,
      })
    }
  }

  // 5. Next task suggestion
  const nextResult = findNextTask(doc)
  if (nextResult) {
    const alreadyInProgress = board.columns
      .find((c) => c.status === 'in_progress')
      ?.cards.some((c) => c.node.id === nextResult.node.id)
    if (!alreadyInProgress) {
      suggestions.push({
        nodeId: nextResult.node.id,
        nodeTitle: nextResult.node.title,
        action: 'start_next',
        reason: `Recommended next task: ${nextResult.reason}`,
        priority: 3,
      })
    }
  }

  // Sort by priority ASC (1 = most urgent)
  suggestions.sort((a, b) => a.priority - b.priority)

  log.debug('kanban-orchestrator:suggestions', { count: suggestions.length })
  return suggestions
}
