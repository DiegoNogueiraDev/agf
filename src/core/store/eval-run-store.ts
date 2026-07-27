/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * EPIC 18 — Evals + Golden Dataset.
 * EvalRunStore — persists eval_run rows and aggregates per run / per model.
 */

import type Database from 'better-sqlite3'
import { now } from '../utils/time.js'
import { generateId } from '../utils/id.js'

export interface EvalRunEntry {
  id: string
  runId: string
  goldenId: string
  score: number
  passed: boolean
  latencyMs?: number
  modelUsed?: string
  costUsd: number
  createdAt: string
}

export interface EvalRunInput {
  runId: string
  goldenId: string
  score: number
  passed: boolean
  latencyMs?: number
  modelUsed?: string
  costUsd?: number
}

export interface RunAggregate {
  total: number
  passed: number
  passRate: number
  totalCostUsd: number
}

export interface PerModelStat {
  modelUsed: string
  total: number
  passed: number
  passRate: number
  totalCostUsd: number
}

interface RunRow {
  id: string
  run_id: string
  golden_id: string
  score: number
  passed: number
  latency_ms: number | null
  model_used: string | null
  cost_usd: number
  created_at: string
}

function rowToEntry(row: RunRow): EvalRunEntry {
  return {
    id: row.id,
    runId: row.run_id,
    goldenId: row.golden_id,
    score: row.score,
    passed: row.passed === 1,
    latencyMs: row.latency_ms ?? undefined,
    modelUsed: row.model_used ?? undefined,
    costUsd: row.cost_usd,
    createdAt: row.created_at,
  }
}

export class EvalRunStore {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  record(input: EvalRunInput): EvalRunEntry {
    const id = generateId('evalrun')
    const createdAt = now()
    const cost = input.costUsd ?? 0
    this.db
      .prepare(
        `INSERT INTO eval_run
          (id, run_id, golden_id, score, passed, latency_ms, model_used, cost_usd, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.runId,
        input.goldenId,
        input.score,
        input.passed ? 1 : 0,
        input.latencyMs ?? null,
        input.modelUsed ?? null,
        cost,
        createdAt,
      )
    return {
      id,
      runId: input.runId,
      goldenId: input.goldenId,
      score: input.score,
      passed: input.passed,
      latencyMs: input.latencyMs,
      modelUsed: input.modelUsed,
      costUsd: cost,
      createdAt,
    }
  }

  listByRunId(runId: string): EvalRunEntry[] {
    const rows = this.db
      .prepare(`SELECT * FROM eval_run WHERE run_id = ? ORDER BY created_at ASC, id ASC`)
      .all(runId) as RunRow[]
    return rows.map(rowToEntry)
  }

  aggregate(runId: string): RunAggregate {
    const row = this.db
      .prepare(
        `SELECT
           COUNT(*)                               AS total,
           COALESCE(SUM(passed), 0)               AS passed,
           COALESCE(SUM(cost_usd), 0)             AS cost
         FROM eval_run
         WHERE run_id = ?`,
      )
      .get(runId) as { total: number; passed: number; cost: number }
    const total = row.total
    const passed = row.passed
    return {
      total,
      passed,
      passRate: total > 0 ? passed / total : 0,
      totalCostUsd: row.cost,
    }
  }

  /**
   * Recent eval_run rows for a given tool (joined via eval_golden.tool).
   * Ordered by created_at DESC, id DESC. Used by the empirical modelHint loop.
   */
  recentByTool(tool: string, limit: number): EvalRunEntry[] {
    const rows = this.db
      .prepare(
        `SELECT r.*
         FROM eval_run r
         JOIN eval_golden g ON g.id = r.golden_id
         WHERE g.tool = ?
         ORDER BY r.created_at DESC, r.rowid DESC
         LIMIT ?`,
      )
      .all(tool, Math.max(0, limit)) as RunRow[]
    return rows.map(rowToEntry)
  }

  perModelStats(runId: string): PerModelStat[] {
    const rows = this.db
      .prepare(
        `SELECT
           COALESCE(model_used, '<unknown>') AS model_used,
           COUNT(*)                          AS total,
           COALESCE(SUM(passed), 0)          AS passed,
           COALESCE(SUM(cost_usd), 0)        AS cost
         FROM eval_run
         WHERE run_id = ?
         GROUP BY COALESCE(model_used, '<unknown>')`,
      )
      .all(runId) as Array<{ model_used: string; total: number; passed: number; cost: number }>
    return rows.map((r) => ({
      modelUsed: r.model_used,
      total: r.total,
      passed: r.passed,
      passRate: r.total > 0 ? r.passed / r.total : 0,
      totalCostUsd: r.cost,
    }))
  }
}
