/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Done Integrity Checker — validates that done tasks have consistent state.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { DoneIntegrityReport, DoneIntegrityIssue } from '../../schemas/validator-schema.js'
import { TASK_TYPES } from '../utils/node-type-sets.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'done-integrity-checker.ts' })

/** Validate that done tasks have consistent state and deps. */
export function checkDoneIntegrity(doc: GraphDocument): DoneIntegrityReport {
  const issues: DoneIntegrityIssue[] = []

  const doneTasks = doc.nodes.filter((n) => TASK_TYPES.has(n.type) && n.status === 'done')
  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]))

  for (const task of doneTasks) {
    // Check 1: Done but still marked as blocked
    if (task.blocked === true) {
      issues.push({
        nodeId: task.id,
        title: task.title,
        issueType: 'blocked_but_done',
        details: `Task "${task.title}" está done mas ainda marcada como blocked`,
      })
    }

    // Check 2: Done but has depends_on edges pointing to non-done nodes
    const dependsOnEdges = doc.edges.filter((e) => e.from === task.id && e.relationType === 'depends_on')
    for (const edge of dependsOnEdges) {
      const dependency = nodeById.get(edge.to)
      if (dependency && dependency.status !== 'done') {
        issues.push({
          nodeId: task.id,
          title: task.title,
          issueType: 'dependency_not_done',
          details: `Task "${task.title}" está done mas depende de "${dependency.title}" (status: ${dependency.status})`,
        })
      }
    }
  }

  const passed = issues.length === 0
  // Bug #074: indicate vacuous pass when no done tasks exist
  const info = doneTasks.length === 0 ? '0 done tasks to check — vacuous pass' : undefined
  log.info('done-integrity-check', { passed, issueCount: issues.length, doneTasks: doneTasks.length })

  return { issues, passed, ...(info ? { info } : {}) }
}
