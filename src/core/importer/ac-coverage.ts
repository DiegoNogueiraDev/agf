/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * AC coverage summary — computes a health report of acceptance-criteria
 * presence across imported task nodes. Used by import-cmd.ts and
 * generate-prd-cmd.ts to surface AC health in the envelope data field.
 */

import type { GraphNode } from '../graph/graph-types.js'

export interface AcCoverageReport {
  tasksTotal: number
  tasksWithExtractedAc: number
  /** tasksSynthesized: reserved for synthesize-ac integration (always 0 here). */
  tasksSynthesized: number
  tasksMissingAc: number
}

/** Compute AC coverage across a set of imported nodes. Only task nodes counted. */
export function computeAcCoverage(nodes: GraphNode[]): AcCoverageReport {
  const tasks = nodes.filter((n) => n.type === 'task')
  const withAc = tasks.filter((n) => Array.isArray(n.acceptanceCriteria) && n.acceptanceCriteria.length > 0)
  return {
    tasksTotal: tasks.length,
    tasksWithExtractedAc: withAc.length,
    tasksSynthesized: 0,
    tasksMissingAc: tasks.length - withAc.length,
  }
}
