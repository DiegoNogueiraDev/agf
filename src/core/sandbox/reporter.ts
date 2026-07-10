/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Wave-12 Sandbox — Reporter.updateGraph
 *
 * Connects sandbox build/test outcomes to the execution graph state. The
 * Reporter is the handoff surface between the isolated build runtime and
 * the task lifecycle: when a sandbox run fails, the corresponding task
 * should become visibly blocked so agents stop pulling it; when a run
 * succeeds on a previously-blocked task, the block is released so work
 * can resume.
 *
 * Policy (deliberately conservative — `finish_task` owns DoD and is the
 * only path to `done`):
 *
 *   previous  │  report.success=false   │  report.success=true
 *   ──────────┼─────────────────────────┼──────────────────────
 *   backlog   │  blocked                │  (no change)
 *   ready     │  blocked                │  (no change)
 *   in_progress│ blocked                │  (no change — DoD gate)
 *   blocked   │  (already blocked)      │  in_progress (unblock)
 *   done      │  (frozen — never write) │  (no change)
 *
 * We never auto-promote to `done`: the DoD (9 checks) belongs to
 * `finish_task`. Auto-done from a green sandbox would side-step AC
 * verification, status-flow validation, and harness scanning.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { NodeNotFoundError } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'reporter.ts' })

/** Minimal subset of a SandboxReport that the graph update needs. */
export interface ReporterOutcome {
  success: boolean
  /** Optional — included for provenance in logs. */
  status?: 'success' | 'failure' | 'error' | 'timeout'
}

export interface GraphUpdateResult {
  nodeId: string
  previousStatus: string
  /** The status actually written. `null` when no write happened. */
  newStatus: 'blocked' | 'in_progress' | null
  /** Present when newStatus is null, explains why. */
  skipped?: string
}

/** updateGraphFromReport —  */
export function updateGraphFromReport(store: SqliteStore, nodeId: string, report: ReporterOutcome): GraphUpdateResult {
  const node = store.getNodeById(nodeId)
  if (!node) {
    throw new NodeNotFoundError(nodeId)
  }
  const previousStatus = node.status

  // `done` is frozen — reporter never writes over it, regardless of outcome.
  if (previousStatus === 'done') {
    log.debug('sandbox:reporter:skipped-done', { nodeId })
    return {
      nodeId,
      previousStatus,
      newStatus: null,
      skipped: 'task already done — reporter never overwrites done',
    }
  }

  if (!report.success) {
    if (previousStatus === 'blocked') {
      return {
        nodeId,
        previousStatus,
        newStatus: null,
        skipped: 'task already blocked — no churn',
      }
    }
    store.updateNodeStatus(nodeId, 'blocked')
    log.info('sandbox:reporter:blocked', { nodeId, previousStatus, status: report.status })
    return { nodeId, previousStatus, newStatus: 'blocked' }
  }

  // Success path — unblock if previously blocked, otherwise leave alone.
  if (previousStatus === 'blocked') {
    store.updateNodeStatus(nodeId, 'in_progress')
    log.info('sandbox:reporter:unblocked', { nodeId, status: report.status })
    return { nodeId, previousStatus, newStatus: 'in_progress' }
  }

  return {
    nodeId,
    previousStatus,
    newStatus: null,
    skipped: 'success — no change (finish_task owns DoD/done transition)',
  }
}
