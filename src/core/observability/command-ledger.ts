/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Universal command invocation ledger — every `agf` subcommand invocation is
 * recorded with its input/output byte sizes, duration, and estimated token
 * cost (1 token ≈ 4 chars). This complements `llm_call_ledger` (which tracks
 * LLM-specific token usage) by giving a complete picture of CLI economy.
 *
 * The table is `command_invocations` (migration v106).
 */
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'

export interface CommandInvocation {
  command: string
  inputBytes: number
  outputBytes: number
  cached: boolean
  durationMs: number
  nodeId?: string
  sessionId?: string
  graphExportBytes?: number // raw graph size at invocation time; baseline for delegate savings
}

export interface CommandLedgerSummary {
  calls: number
  inputBytes: number
  outputBytes: number
  estimatedTokens: number
  cachedCalls: number
  avgDurationMs: number
  graphExportBytes: number // SUM(graph_export_bytes) — total counterfactual context bytes
  callsWithGraphData: number // calls where graph_export_bytes > 0 (for extrapolation)
}

const ESTIMATED_CHARS_PER_TOKEN = 4

export function recordCommandInvocation(db: Database.Database, inv: CommandInvocation): string {
  const id = `cmd_${randomUUID().replace(/-/g, '').slice(0, 16)}`
  const estimatedTokens = Math.ceil((inv.inputBytes + inv.outputBytes) / ESTIMATED_CHARS_PER_TOKEN)

  db.prepare(
    `INSERT INTO command_invocations
      (id, ts, command, input_bytes, output_bytes, estimated_tokens, cached, duration_ms, node_id, session_id, graph_export_bytes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    Date.now(),
    inv.command,
    inv.inputBytes,
    inv.outputBytes,
    estimatedTokens,
    inv.cached ? 1 : 0,
    inv.durationMs,
    inv.nodeId ?? null,
    inv.sessionId ?? null,
    inv.graphExportBytes ?? 0,
  )
  return id
}

export function summarizeCommandLedger(db: Database.Database, opts: { sessionId?: string } = {}): CommandLedgerSummary {
  const where = opts.sessionId ? 'WHERE session_id = ?' : ''
  const params = opts.sessionId ? [opts.sessionId] : []

  const row = db
    .prepare(
      `SELECT COUNT(*) AS calls,
              COALESCE(SUM(input_bytes), 0) AS ibytes,
              COALESCE(SUM(output_bytes), 0) AS obytes,
              COALESCE(SUM(estimated_tokens), 0) AS etokens,
              COALESCE(SUM(cached), 0) AS cached_calls,
              COALESCE(AVG(duration_ms), 0) AS avg_ms,
              COALESCE(SUM(graph_export_bytes), 0) AS gexport_bytes,
              COALESCE(SUM(CASE WHEN graph_export_bytes > 0 THEN 1 ELSE 0 END), 0) AS calls_with_graph
       FROM command_invocations ${where}`,
    )
    .get(...params) as {
    calls: number
    ibytes: number
    obytes: number
    etokens: number
    cached_calls: number
    avg_ms: number
    gexport_bytes: number
    calls_with_graph: number
  }

  return {
    calls: row.calls,
    inputBytes: row.ibytes,
    outputBytes: row.obytes,
    estimatedTokens: row.etokens,
    cachedCalls: row.cached_calls,
    avgDurationMs: Math.round(row.avg_ms),
    graphExportBytes: row.gexport_bytes,
    callsWithGraphData: row.calls_with_graph,
  }
}
