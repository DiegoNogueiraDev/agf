/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Tool Token Store — tracks token usage per MCP tool call.
 * Follows KnowledgeStore pattern: receives Database.Database in constructor.
 */

import type Database from 'better-sqlite3'
import { now } from '../utils/time.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'tool-token-store.ts' })

export interface ToolTokenEntry {
  id: number
  projectId: string
  toolName: string
  inputTokens: number
  outputTokens: number
  calledAt: string
}

export interface ToolTokenAggregate {
  toolName: string
  callCount: number
  totalInputTokens: number
  totalOutputTokens: number
  avgInputTokens: number
  avgOutputTokens: number
  totalTokens: number
}

export interface ToolTokenSummary {
  totalCalls: number
  totalInputTokens: number
  totalOutputTokens: number
  perTool: ToolTokenAggregate[]
  recentCalls: ToolTokenEntry[]
}

/** Options for recordCall — V11 Maestro telemetry payload. */
export interface RecordCallOptions {
  inputTokens: number
  outputTokens: number
  success: boolean
  durationMs: number
  errorKind?: string
}

/** Per-tool usage stats over a window — V11 Maestro deprecation gate evidence. */
export interface UsageStats {
  toolName: string
  callCount: number
  lastUsedAt: string
  /** 0..1 — fraction of calls with success=true (NULL legacy rows count as success). */
  successRate: number
  avgDurationMs: number
  p95DurationMs: number
}

interface TokenRow {
  id: number
  project_id: string
  tool_name: string
  input_tokens: number
  output_tokens: number
  called_at: string
}

interface AggregateRow {
  tool_name: string
  call_count: number
  total_input: number
  total_output: number
  avg_input: number
  avg_output: number
}

interface TotalsRow {
  total_calls: number
  total_input: number
  total_output: number
}

function rowToEntry(row: TokenRow): ToolTokenEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    toolName: row.tool_name,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    calledAt: row.called_at,
  }
}

function rowToAggregate(row: AggregateRow): ToolTokenAggregate {
  return {
    toolName: row.tool_name,
    callCount: row.call_count,
    totalInputTokens: row.total_input,
    totalOutputTokens: row.total_output,
    avgInputTokens: Math.round(row.avg_input),
    avgOutputTokens: Math.round(row.avg_output),
    totalTokens: row.total_input + row.total_output,
  }
}

export class ToolTokenStore {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  record(projectId: string, toolName: string, inputTokens: number, outputTokens: number): void {
    this.db
      .prepare(
        `INSERT INTO tool_token_usage (project_id, tool_name, input_tokens, output_tokens, called_at)
       VALUES (?, ?, ?, ?, ?)`,
      )
      .run(projectId, toolName, inputTokens, outputTokens, now())
    log.debug('tool-token-store: recorded', { toolName, inputTokens, outputTokens })
  }

  getPerToolStats(projectId: string): ToolTokenAggregate[] {
    const rows = this.db
      .prepare(
        `SELECT
         tool_name,
         COUNT(*) AS call_count,
         SUM(input_tokens) AS total_input,
         SUM(output_tokens) AS total_output,
         AVG(input_tokens) AS avg_input,
         AVG(output_tokens) AS avg_output
       FROM tool_token_usage
       WHERE project_id = ?
       GROUP BY tool_name
       ORDER BY (SUM(input_tokens) + SUM(output_tokens)) DESC`,
      )
      .all(projectId) as AggregateRow[]

    return rows.map(rowToAggregate)
  }

  getRecentCalls(projectId: string, limit: number = 20): ToolTokenEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM tool_token_usage
       WHERE project_id = ?
       ORDER BY called_at DESC, id DESC
       LIMIT ?`,
      )
      .all(projectId, limit) as TokenRow[]

    return rows.map(rowToEntry)
  }

  getSummary(projectId: string, recentLimit: number = 20): ToolTokenSummary {
    const totals = this.db
      .prepare(
        `SELECT
         COUNT(*) AS total_calls,
         COALESCE(SUM(input_tokens), 0) AS total_input,
         COALESCE(SUM(output_tokens), 0) AS total_output
       FROM tool_token_usage
       WHERE project_id = ?`,
      )
      .get(projectId) as TotalsRow

    return {
      totalCalls: totals.total_calls,
      totalInputTokens: totals.total_input,
      totalOutputTokens: totals.total_output,
      perTool: this.getPerToolStats(projectId),
      recentCalls: this.getRecentCalls(projectId, recentLimit),
    }
  }

  clearProject(projectId: string): void {
    this.db.prepare('DELETE FROM tool_token_usage WHERE project_id = ?').run(projectId)
    log.debug('tool-token-store: cleared project', { projectId })
  }

  /**
   * Record a tool call with full telemetry (V11 Maestro Phase 1).
   * Captures success, durationMs, and optional errorKind alongside token usage.
   * Legacy callers should keep using `record()` — both write to the same table.
   */
  recordCall(projectId: string, toolName: string, opts: RecordCallOptions): void {
    this.db
      .prepare(
        `INSERT INTO tool_token_usage
         (project_id, tool_name, input_tokens, output_tokens, called_at,
          success, duration_ms, error_kind)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        projectId,
        toolName,
        opts.inputTokens,
        opts.outputTokens,
        now(),
        opts.success ? 1 : 0,
        opts.durationMs,
        opts.errorKind ?? null,
      )
    log.debug('tool-token-store: recordCall', {
      toolName,
      success: opts.success,
      durationMs: opts.durationMs,
    })
  }

  /**
   * Per-tool usage stats over a window (V11 Maestro Phase 1).
   * Backs the deprecation gate: a tool with callCount=0 over 30d is a candidate for removal.
   *
   * @param projectId — scope to a single project
   * @param sinceDays — optional window (only count calls in the last N days). Default: all time.
   */
  getUsageStats(projectId: string, sinceDays?: number): UsageStats[] {
    const sinceClause =
      sinceDays !== undefined ? `AND called_at >= datetime('now', '-${Math.max(0, Math.floor(sinceDays))} days')` : ''

    const aggRows = this.db
      .prepare(
        `SELECT
         tool_name                                                    AS tool_name,
         COUNT(*)                                                     AS call_count,
         MAX(called_at)                                               AS last_used_at,
         AVG(CASE WHEN success IS NULL OR success = 1 THEN 1.0 ELSE 0.0 END) AS success_rate,
         AVG(duration_ms)                                             AS avg_duration_ms
       FROM tool_token_usage
       WHERE project_id = ? ${sinceClause}
       GROUP BY tool_name
       ORDER BY call_count DESC`,
      )
      .all(projectId) as Array<{
      tool_name: string
      call_count: number
      last_used_at: string
      success_rate: number
      avg_duration_ms: number | null
    }>

    return aggRows.map((row) => ({
      toolName: row.tool_name,
      callCount: row.call_count,
      lastUsedAt: row.last_used_at,
      successRate: row.success_rate,
      avgDurationMs: row.avg_duration_ms === null ? 0 : Math.round(row.avg_duration_ms),
      p95DurationMs: this.computeP95(projectId, row.tool_name, sinceDays),
    }))
  }

  /** P95 over duration_ms for a single tool (sort + index). */
  private computeP95(projectId: string, toolName: string, sinceDays?: number): number {
    const sinceClause =
      sinceDays !== undefined ? `AND called_at >= datetime('now', '-${Math.max(0, Math.floor(sinceDays))} days')` : ''

    const rows = this.db
      .prepare(
        `SELECT duration_ms FROM tool_token_usage
       WHERE project_id = ? AND tool_name = ? AND duration_ms IS NOT NULL ${sinceClause}
       ORDER BY duration_ms ASC`,
      )
      .all(projectId, toolName) as Array<{ duration_ms: number }>

    if (rows.length === 0) return 0
    const idx = Math.min(rows.length - 1, Math.ceil(0.95 * rows.length) - 1)
    return rows[Math.max(0, idx)].duration_ms
  }
}
