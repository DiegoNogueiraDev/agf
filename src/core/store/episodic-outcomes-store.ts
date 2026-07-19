/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Episodic Outcomes Store — Task 2.1 (autonomy-gap-3-to-6 PRD).
 *
 * Provides insert/query operations for the `episodic_outcomes` SQLite table.
 * All computation is deterministic. §ADR-deterministic-first
 *
 * Schema: episodic_outcomes(id, node_id, task_type, tags, approach_summary,
 *   outcome, cycle_time_delta, reopen_count, created_at)
 */

import type Database from 'better-sqlite3'

export type EpisodicOutcomeResult = 'success' | 'partial' | 'failure'

export interface EpisodicOutcome {
  id: string
  nodeId: string
  taskType: string
  tags: string
  approachSummary: string
  outcome: EpisodicOutcomeResult
  cycleTimeDelta: number
  reopenCount: number
  createdAt: number
}

export interface EpisodicQueryOptions {
  taskType?: string
  limit?: number
  maxAgeDays?: number
}

/**
 * Build a normalized, sorted task_type string from an array of tags.
 * Example: ["security", "auth"] → "auth,security"
 */
export function buildTaskType(tags: string[] | undefined): string {
  if (!tags || tags.length === 0) return ''
  const normalized = [...new Set(tags.map((t) => t.toLowerCase().trim()))].sort()
  return normalized.join(',')
}

/**
 * Derive outcome from reopen_count.
 * 0 → success, 1 → partial, >1 → failure
 */
export function computeOutcome(reopenCount: number): EpisodicOutcomeResult {
  if (reopenCount === 0) return 'success'
  if (reopenCount === 1) return 'partial'
  return 'failure'
}

/**
 * Build a deterministic approach_summary digest.
 * Format: sorted(touchedFiles).join('+') + ':' + sortedAcIds.join(',')
 */
export function buildApproachSummary(touchedFiles: string[], acIds: string[]): string {
  const files = [...touchedFiles].sort().join('+')
  const acs = [...acIds].sort().join(',')
  return `${files}:${acs}`
}

/**
 * Count how many times a task was reopened by inspecting node_changelog
 * for status changes to 'in_progress' where old_value is not an initial status.
 */
export function countReopens(db: Database.Database, projectId: string, nodeId: string): number {
  try {
    const rows = db
      .prepare(
        `SELECT old_value FROM node_changelog
       WHERE project_id = ? AND node_id = ? AND field = 'status'
         AND new_value = 'in_progress'
         AND old_value NOT IN ('backlog', 'ready')
       ORDER BY changed_at`,
      )
      .all(projectId, nodeId) as Array<{ old_value: string }>
    return rows.length
  } catch {
    return 0
  }
}

/**
 * Insert an episodic outcome record into the database.
 */
export function insertEpisodicOutcome(db: Database.Database, outcome: EpisodicOutcome): void {
  db.prepare(
    `INSERT OR IGNORE INTO episodic_outcomes
       (id, node_id, task_type, tags, approach_summary, outcome, cycle_time_delta, reopen_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    outcome.id,
    outcome.nodeId,
    outcome.taskType,
    outcome.tags,
    outcome.approachSummary,
    outcome.outcome,
    outcome.cycleTimeDelta,
    outcome.reopenCount,
    outcome.createdAt,
  )
}

/**
 * Query episodic outcomes, optionally filtered by taskType and age.
 * Returns rows ordered by created_at DESC.
 */
export function queryEpisodicOutcomes(db: Database.Database, opts: EpisodicQueryOptions = {}): EpisodicOutcome[] {
  const conditions: string[] = []
  const params: unknown[] = []

  if (opts.taskType) {
    conditions.push('task_type = ?')
    params.push(opts.taskType)
  }

  if (opts.maxAgeDays) {
    const cutoff = Date.now() - opts.maxAgeDays * 24 * 3600 * 1000
    conditions.push('created_at >= ?')
    params.push(cutoff)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = Math.min(opts.limit ?? 100, 500)
  params.push(limit)

  const rows = db
    .prepare(
      `SELECT id, node_id, task_type, tags, approach_summary, outcome,
            cycle_time_delta, reopen_count, created_at
     FROM episodic_outcomes
     ${where}
     ORDER BY created_at DESC
     LIMIT ?`,
    )
    .all(...params) as Array<{
    id: string
    node_id: string
    task_type: string
    tags: string
    approach_summary: string
    outcome: EpisodicOutcomeResult
    cycle_time_delta: number
    reopen_count: number
    created_at: number
  }>

  return rows.map((r) => ({
    id: r.id,
    nodeId: r.node_id,
    taskType: r.task_type,
    tags: r.tags,
    approachSummary: r.approach_summary,
    outcome: r.outcome,
    cycleTimeDelta: r.cycle_time_delta,
    reopenCount: r.reopen_count,
    createdAt: r.created_at,
  }))
}

/**
 * Node ids com pelo menos um desfecho `success` — base do "custo por sucesso"
 * (custo ÷ tasks bem-sucedidas), a métrica de decisão recomendada pela Microsoft
 * (custo médio por tentativa ÷ taxa de sucesso).
 */
export function successfulNodeIds(db: Database.Database): Set<string> {
  const rows = db.prepare(`SELECT DISTINCT node_id FROM episodic_outcomes WHERE outcome = 'success'`).all() as Array<{
    node_id: string
  }>
  return new Set(rows.map((r) => r.node_id))
}
