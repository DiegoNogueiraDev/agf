/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Immune Dashboard — analytics over healing_log + healing_patterns.
 * Reads deterministically from SQLite; zero LLM calls.
 *
 * AC1: Top antigen kinds by frequency (sorted by count desc)
 * AC2: Recovery success rate by antigen kind
 * AC3: Cost of immune system operation (applied vs filtered, auto_applied)
 * AC4: Hottest nodes by danger signal density
 * AC5: Cost-benefit summary (patterns learned, auto-applied, estimated saved)
 */

import type { SqliteStore } from '../store/sqlite-store.js'

export interface AntigenFrequencyEntry {
  issueType: string
  count: number
}

export interface RecoveryRateEntry {
  issueType: string
  total: number
  succeeded: number
  rate: number
}

export interface OperationCost {
  totalOperations: number
  appliedCount: number
  filteredCount: number
  autoAppliedPatterns: number
}

export interface HotNode {
  nodeId: string
  signalCount: number
}

export interface CostBenefitSummary {
  patternsLearned: number
  autoApplied: number
  estimatedManualSaved: number
}

export interface ImmuneDashboard {
  antigenFrequency: AntigenFrequencyEntry[]
  recoveryRates: RecoveryRateEntry[]
  operationCost: OperationCost
  hottestNodes: HotNode[]
  costBenefit: CostBenefitSummary
}

/** Build a snapshot of the immune system status — danger signals, cost-benefit metrics, and circuit-breaker state. */
export function getImmuneDashboard(store: SqliteStore): ImmuneDashboard {
  const db = store.getDb()
  const projectId = store.getProject()?.id ?? 'default'

  // AC1: Top antigen kinds by frequency
  const antigenRows = db
    .prepare(
      `SELECT issue_type, COUNT(*) as count FROM healing_log
       WHERE project_id = ? GROUP BY issue_type ORDER BY count DESC`,
    )
    .all(projectId) as { issue_type: string; count: number }[]

  const antigenFrequency: AntigenFrequencyEntry[] = antigenRows.map((r) => ({
    issueType: r.issue_type,
    count: r.count,
  }))

  // AC2: Recovery success rate by antigen kind
  const rateRows = db
    .prepare(
      `SELECT issue_type, COUNT(*) as total, SUM(success) as succeeded
       FROM healing_log WHERE project_id = ? GROUP BY issue_type`,
    )
    .all(projectId) as { issue_type: string; total: number; succeeded: number }[]

  const recoveryRates: RecoveryRateEntry[] = rateRows.map((r) => ({
    issueType: r.issue_type,
    total: r.total,
    succeeded: r.succeeded,
    rate: r.total > 0 ? r.succeeded / r.total : 0,
  }))

  // AC3: Cost of immune system operation
  const costRow = db
    .prepare(
      `SELECT COUNT(*) as total, SUM(applied) as applied_count
       FROM healing_log WHERE project_id = ?`,
    )
    .get(projectId) as { total: number; applied_count: number } | undefined

  const autoAppliedRow = db
    .prepare(`SELECT COUNT(*) as n FROM healing_patterns WHERE project_id = ? AND auto_applied = 1`)
    .get(projectId) as { n: number } | undefined

  const totalOps = costRow?.total ?? 0
  const appliedCount = costRow?.applied_count ?? 0
  const operationCost: OperationCost = {
    totalOperations: totalOps,
    appliedCount,
    filteredCount: totalOps - appliedCount,
    autoAppliedPatterns: autoAppliedRow?.n ?? 0,
  }

  // AC4: Hottest nodes by danger signal density (null node_id excluded)
  const nodeRows = db
    .prepare(
      `SELECT node_id, COUNT(*) as signal_count
       FROM healing_log
       WHERE project_id = ? AND node_id IS NOT NULL
       GROUP BY node_id ORDER BY signal_count DESC LIMIT 20`,
    )
    .all(projectId) as { node_id: string; signal_count: number }[]

  const hottestNodes: HotNode[] = nodeRows.map((r) => ({
    nodeId: r.node_id,
    signalCount: r.signal_count,
  }))

  // AC5: Cost-benefit summary
  const patternRow = db
    .prepare(
      `SELECT COUNT(*) as total, SUM(auto_applied) as auto_applied_sum
       FROM healing_patterns WHERE project_id = ?`,
    )
    .get(projectId) as { total: number; auto_applied_sum: number } | undefined

  const patternsLearned = patternRow?.total ?? 0
  const autoApplied = patternRow?.auto_applied_sum ?? 0
  const costBenefit: CostBenefitSummary = {
    patternsLearned,
    autoApplied,
    estimatedManualSaved: autoApplied,
  }

  return {
    antigenFrequency,
    recoveryRates,
    operationCost,
    hottestNodes,
    costBenefit,
  }
}
