/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Flow Metrics Store — A/B telemetry for the transient-hypofrontality feature.
 *
 * Records, per context call, the flow state and how much the topological decay
 * pruned vs. how many invariants were pinned, tagged by `flow_on`/`flow_off`.
 * Pairs with {@link computeFlowReport} (flow-report.ts) to answer the empirical
 * question: does flow save tokens *without* raising the defect/reopen rate?
 *
 * Telemetry-only. Deterministic insert/query. §ADR-deterministic-first
 */

import type Database from 'better-sqlite3'

export type FlowMode = 'flow_on' | 'flow_off'

export interface FlowMetric {
  id: string
  projectId: string
  nodeId: string
  mode: FlowMode
  phi: number
  lambda: number
  tokensBaseline: number
  tokensActual: number
  prunedCount: number
  pinnedCount: number
  createdAt: number
}

export interface FlowMetricQueryOptions {
  projectId?: string
  mode?: FlowMode
  limit?: number
  maxAgeDays?: number
}

/** Insert a flow telemetry row. */
export function insertFlowMetric(db: Database.Database, metric: FlowMetric): void {
  db.prepare(
    `INSERT OR IGNORE INTO flow_metrics
       (id, project_id, node_id, mode, phi, lambda,
        tokens_baseline, tokens_actual, pruned_count, pinned_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    metric.id,
    metric.projectId,
    metric.nodeId,
    metric.mode,
    metric.phi,
    metric.lambda,
    metric.tokensBaseline,
    metric.tokensActual,
    metric.prunedCount,
    metric.pinnedCount,
    metric.createdAt,
  )
}

/** Query flow telemetry rows, newest first. */
export function queryFlowMetrics(db: Database.Database, opts: FlowMetricQueryOptions = {}): FlowMetric[] {
  const conditions: string[] = []
  const params: unknown[] = []

  if (opts.projectId) {
    conditions.push('project_id = ?')
    params.push(opts.projectId)
  }
  if (opts.mode) {
    conditions.push('mode = ?')
    params.push(opts.mode)
  }
  if (opts.maxAgeDays) {
    conditions.push('created_at >= ?')
    params.push(Date.now() - opts.maxAgeDays * 24 * 3600 * 1000)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = Math.min(opts.limit ?? 200, 1000)
  params.push(limit)

  const rows = db
    .prepare(
      `SELECT id, project_id, node_id, mode, phi, lambda,
            tokens_baseline, tokens_actual, pruned_count, pinned_count, created_at
     FROM flow_metrics
     ${where}
     ORDER BY created_at DESC
     LIMIT ?`,
    )
    .all(...params) as Array<{
    id: string
    project_id: string
    node_id: string
    mode: FlowMode
    phi: number
    lambda: number
    tokens_baseline: number
    tokens_actual: number
    pruned_count: number
    pinned_count: number
    created_at: number
  }>

  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    nodeId: r.node_id,
    mode: r.mode,
    phi: r.phi,
    lambda: r.lambda,
    tokensBaseline: r.tokens_baseline,
    tokensActual: r.tokens_actual,
    prunedCount: r.pruned_count,
    pinnedCount: r.pinned_count,
    createdAt: r.created_at,
  }))
}
