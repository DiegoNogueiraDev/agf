/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Performance Budget Analyzer — checks performance budget node status.
 *
 * Checks:
 * - Metadata has metricName and threshold
 * - Status from metadata.status or default "untested"
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'performance-budget-check.ts' })

export type BudgetStatus = 'untested' | 'passing' | 'failing'

export interface PerformanceBudgetReport {
  budgets: Array<{ nodeId: string; title: string; metric: string; threshold: string; status: BudgetStatus }>
  totalBudgets: number
  untestedCount: number
}

function toBudgetStatus(value: unknown): BudgetStatus {
  if (value === 'passing' || value === 'failing') return value
  return 'untested'
}

/** analyzePerformanceBudgets —  */
export function analyzePerformanceBudgets(doc: GraphDocument): PerformanceBudgetReport {
  const budgetNodes = doc.nodes.filter((n) => n.type === 'performance_budget')

  const budgets: PerformanceBudgetReport['budgets'] = []
  let untestedCount = 0

  for (const node of budgetNodes) {
    const metric = typeof node.metadata?.metricName === 'string' ? node.metadata.metricName : 'unknown'
    const threshold =
      typeof node.metadata?.threshold === 'string'
        ? node.metadata.threshold
        : typeof node.metadata?.threshold === 'number'
          ? String(node.metadata.threshold)
          : 'unspecified'
    const status = toBudgetStatus(node.metadata?.status)

    if (status === 'untested') untestedCount++

    budgets.push({ nodeId: node.id, title: node.title, metric, threshold, status })
  }

  log.debug('analyzer:performance-budget', {
    totalBudgets: budgetNodes.length,
    untestedCount,
  })

  return {
    budgets,
    totalBudgets: budgetNodes.length,
    untestedCount,
  }
}
