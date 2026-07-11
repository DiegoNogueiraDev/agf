/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * TraceStore — Persistent observability for agent execution traces.
 *
 * Implements the Observability Theorem (Kalman, 1960): a system is observable
 * iff its internal state can be determined from observed outputs in finite time.
 *
 * Every start_task/finish_task cycle creates a trace; each internal operation
 * (RAG, guardrail, quality gate) creates a span within that trace.
 *
 * Layer: L0_SQL (pure data persistence, zero decision logic).
 */

import type Database from 'better-sqlite3'
import { generateId } from '../utils/id.js'
import { now } from '../utils/time.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'trace-store.ts' })

// ── Interfaces ─────────────────────────────────────────

export interface TraceRecord {
  id: string
  threadId: string
  nodeId: string | null
  toolName: string
  startedAt: string
  endedAt: string | null
  latencyMs: number | null
  status: 'running' | 'completed' | 'error'
  tokensIn: number
  tokensOut: number
  estimatedCostUsd: number
  metadata: Record<string, unknown>
}

export interface SpanRecord {
  id: string
  traceId: string
  parentSpanId: string | null
  name: string
  startedAt: string
  endedAt: string | null
  latencyMs: number | null
  inputSummary: string | null
  outputSummary: string | null
  metadata: Record<string, unknown>
}

export interface TraceTokens {
  tokensIn?: number
  tokensOut?: number
  estimatedCostUsd?: number
}

export interface EndSpanOptions {
  outputSummary?: string
  metadata?: Record<string, unknown>
}

export interface NodeCost {
  totalTokens: number
  estimatedCostUsd: number
  traceCount: number
}

export interface CostSummary {
  totalCost: number
  avgTokensPerTask: number
  avgCostPerTask: number
}

// ── Row types (SQLite) ─────────────────────────────────

interface TraceRow {
  id: string
  thread_id: string
  node_id: string | null
  tool_name: string
  started_at: string
  ended_at: string | null
  latency_ms: number | null
  status: string
  tokens_in: number
  tokens_out: number
  estimated_cost_usd: number
  metadata: string
}

interface SpanRow {
  id: string
  trace_id: string
  parent_span_id: string | null
  name: string
  started_at: string
  ended_at: string | null
  latency_ms: number | null
  input_summary: string | null
  output_summary: string | null
  metadata: string
}

interface CostRow {
  total_tokens: number
  total_cost: number
  trace_count: number
}

// ── TraceStore ─────────────────────────────────────────

export class TraceStore {
  private db: Database.Database
  private startTimes: Map<string, number> = new Map()

  constructor(db: Database.Database) {
    this.db = db
  }

  // ── Trace lifecycle ────────────────────────────────

  /** Create a new trace and return its ID. */
  beginTrace(threadId: string, nodeId: string | null, toolName: string): string {
    const id = generateId('trace')
    const startedAt = now()

    this.db
      .prepare(
        `INSERT INTO execution_traces (id, thread_id, node_id, tool_name, started_at, status)
       VALUES (?, ?, ?, ?, ?, 'running')`,
      )
      .run(id, threadId, nodeId, toolName, startedAt)

    this.startTimes.set(id, performance.now())
    log.debug('trace:begin', { traceId: id, threadId, nodeId, toolName })
    return id
  }

  /** Close a trace with final status and optional token usage. */
  endTrace(traceId: string, status: 'completed' | 'error', tokens?: TraceTokens): void {
    const endedAt = now()
    const startTime = this.startTimes.get(traceId)
    const latencyMs = startTime != null ? Math.round(performance.now() - startTime) : null

    this.db
      .prepare(
        `UPDATE execution_traces
       SET ended_at = ?, latency_ms = ?, status = ?,
           tokens_in = COALESCE(?, tokens_in), tokens_out = COALESCE(?, tokens_out),
           estimated_cost_usd = COALESCE(?, estimated_cost_usd)
       WHERE id = ?`,
      )
      .run(
        endedAt,
        latencyMs,
        status,
        tokens?.tokensIn ?? null,
        tokens?.tokensOut ?? null,
        tokens?.estimatedCostUsd ?? null,
        traceId,
      )

    this.startTimes.delete(traceId)
    log.debug('trace:end', { traceId, status, latencyMs })
  }

  // ── Span lifecycle ─────────────────────────────────

  /** Add a span to a trace. Returns spanId. */
  addSpan(traceId: string, name: string, parentSpanId?: string): string {
    const id = generateId('span')
    const startedAt = now()

    this.db
      .prepare(
        `INSERT INTO execution_spans (id, trace_id, parent_span_id, name, started_at)
       VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, traceId, parentSpanId ?? null, name, startedAt)

    this.startTimes.set(id, performance.now())
    return id
  }

  /** Close a span with optional output summary. */
  endSpan(spanId: string, options?: EndSpanOptions): void {
    const endedAt = now()
    const startTime = this.startTimes.get(spanId)
    const latencyMs = startTime != null ? Math.round(performance.now() - startTime) : null

    this.db
      .prepare(
        `UPDATE execution_spans
       SET ended_at = ?, latency_ms = ?, output_summary = ?,
           metadata = COALESCE(?, metadata)
       WHERE id = ?`,
      )
      .run(
        endedAt,
        latencyMs,
        options?.outputSummary ?? null,
        options?.metadata ? JSON.stringify(options.metadata) : null,
        spanId,
      )

    this.startTimes.delete(spanId)
  }

  // ── Queries ────────────────────────────────────────

  /** Get a single trace by ID. Returns null if not found. */
  getTrace(traceId: string): TraceRecord | null {
    const row = this.db.prepare('SELECT * FROM execution_traces WHERE id = ?').get(traceId) as TraceRow | undefined

    return row ? this.mapTrace(row) : null
  }

  /** Get all traces for a node, ordered by started_at ASC. */
  getTracesByNode(nodeId: string): TraceRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM execution_traces WHERE node_id = ? ORDER BY started_at ASC')
      .all(nodeId) as TraceRow[]

    return rows.map((r) => this.mapTrace(r))
  }

  /** Get all traces for a thread, ordered by started_at ASC. */
  getTracesByThread(threadId: string): TraceRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM execution_traces WHERE thread_id = ? ORDER BY started_at ASC')
      .all(threadId) as TraceRow[]

    return rows.map((r) => this.mapTrace(r))
  }

  /** Get all spans for a trace, ordered by started_at ASC. */
  getSpansByTrace(traceId: string): SpanRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM execution_spans WHERE trace_id = ? ORDER BY started_at ASC')
      .all(traceId) as SpanRow[]

    return rows.map((r) => this.mapSpan(r))
  }

  // ── Cost tracking (T7 — Bounded Rationality) ──────

  /** Get aggregated cost for a specific node. */
  getCostByNode(nodeId: string): NodeCost {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(tokens_in + tokens_out), 0) as total_tokens,
              COALESCE(SUM(estimated_cost_usd), 0) as total_cost,
              COUNT(*) as trace_count
       FROM execution_traces WHERE node_id = ?`,
      )
      .get(nodeId) as CostRow

    return {
      totalTokens: row.total_tokens,
      estimatedCostUsd: row.total_cost,
      traceCount: row.trace_count === 0 ? 0 : row.trace_count,
    }
  }

  /** Get cost summary across all traced nodes. */
  getCostSummary(): CostSummary {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(estimated_cost_usd), 0) as total_cost,
              COALESCE(AVG(tokens_in + tokens_out), 0) as avg_tokens,
              COALESCE(AVG(estimated_cost_usd), 0) as avg_cost
       FROM execution_traces WHERE node_id IS NOT NULL`,
      )
      .get() as { total_cost: number; avg_tokens: number; avg_cost: number }

    return {
      totalCost: row.total_cost,
      avgTokensPerTask: Math.round(row.avg_tokens),
      avgCostPerTask: row.avg_cost,
    }
  }

  // ── Internal ───────────────────────────────────────

  private mapTrace(row: TraceRow): TraceRecord {
    return {
      id: row.id,
      threadId: row.thread_id,
      nodeId: row.node_id,
      toolName: row.tool_name,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      latencyMs: row.latency_ms,
      status: row.status as TraceRecord['status'],
      tokensIn: row.tokens_in,
      tokensOut: row.tokens_out,
      estimatedCostUsd: row.estimated_cost_usd,
      metadata: JSON.parse(row.metadata || '{}') as Record<string, unknown>,
    }
  }

  private mapSpan(row: SpanRow): SpanRecord {
    return {
      id: row.id,
      traceId: row.trace_id,
      parentSpanId: row.parent_span_id,
      name: row.name,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      latencyMs: row.latency_ms,
      inputSummary: row.input_summary,
      outputSummary: row.output_summary,
      metadata: JSON.parse(row.metadata || '{}') as Record<string, unknown>,
    }
  }
}
