/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Status Flow Checker — validates that done tasks went through proper status transitions.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { StatusFlowReport, StatusFlowViolation } from '../../schemas/validator-schema.js'
import { TASK_TYPES } from '../utils/node-type-sets.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'status-flow-checker.ts' })

/** Validate done tasks went through proper status transitions. */
export function checkStatusFlow(doc: GraphDocument): StatusFlowReport {
  const violations: StatusFlowViolation[] = []

  const doneTasks = doc.nodes.filter((n) => TASK_TYPES.has(n.type) && n.status === 'done')

  for (const task of doneTasks) {
    // Heuristic: if updatedAt === createdAt, the task never transitioned through statuses
    if (task.updatedAt === task.createdAt) {
      violations.push({
        nodeId: task.id,
        title: task.title,
        currentStatus: task.status,
        // Bug #095: note that this is a heuristic — timestamps may be imprecise
        details: `Task "${task.title}" marcada como done sem transição de status (createdAt === updatedAt). Nota: heurística baseada em timestamps — pode ser imprecisa.`,
      })
    }
  }

  const complianceRate =
    doneTasks.length === 0 ? 100 : Math.round(((doneTasks.length - violations.length) / doneTasks.length) * 100)

  log.info('status-flow-check', { complianceRate, violationCount: violations.length })

  return { violations, complianceRate }
}
