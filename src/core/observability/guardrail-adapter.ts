/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * GuardrailAdapter — Unified interface for all quality gates, contracts, and invariants.
 *
 * Implements Design by Contract (Meyer, 1986): every guardrail operates under
 * an explicit contract with preconditions, postconditions, and invariants.
 *
 * Inspired by LangWatch's `as_guardrail=true` pattern — any evaluator can
 * become a guardrail with a unified result interface.
 *
 * Layer: L3_PropertyBased (invariant enforcement).
 */

import type Database from 'better-sqlite3'
import { generateId } from '../utils/id.js'
import { now } from '../utils/time.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'guardrail-adapter.ts' })

// ── Interfaces ─────────────────────────────────────────

export interface GuardrailResult {
  passed: boolean
  score: number
  name: string
  details: string
  strategy: 'fail_open' | 'fail_closed'
}

export interface Guardrail {
  name: string
  position: 'pre' | 'post'
  strategy: 'fail_open' | 'fail_closed'
  run: (context: GuardrailContext) => GuardrailResult
}

export interface GuardrailContext {
  projectPath: string
  nodeId?: string
  traceId?: string
}

export interface GuardrailPipelineResult {
  results: GuardrailResult[]
  allPassed: boolean
  blockingFailures: GuardrailResult[]
}

export interface GuardrailPipelineOptions {
  traceId?: string
  store?: GuardrailStore
}

export interface GuardrailExecutionRecord {
  id: string
  traceId: string
  name: string
  position: string
  passed: boolean
  score: number
  latencyMs: number
  strategy: string
  details: string
  createdAt: string
}

export interface GuardrailRecordInput {
  traceId: string
  name: string
  position: string
  passed: boolean
  score: number
  latencyMs: number
  strategy: string
  details: string
}

// ── Row type (SQLite) ──────────────────────────────────

interface GuardrailRow {
  id: string
  trace_id: string
  name: string
  position: string
  passed: number
  score: number
  latency_ms: number
  strategy: string
  details: string
  created_at: string
}

// ── Pipeline executor ──────────────────────────────────

/**
 * Run a pipeline of guardrails sequentially.
 * Returns structured results with blocking failures separated.
 *
 * Contract:
 *   Precondition:  guardrails is a valid array, context has projectPath
 *   Postcondition: every guardrail produces a GuardrailResult
 *   Invariant:     fail_closed failures are always in blockingFailures
 */
export function runGuardrailPipeline(
  guardrails: Guardrail[],
  context: GuardrailContext,
  options?: GuardrailPipelineOptions,
): GuardrailPipelineResult {
  const results: GuardrailResult[] = []
  const blockingFailures: GuardrailResult[] = []

  for (const guardrail of guardrails) {
    const startTime = performance.now()
    let resultValue: GuardrailResult

    try {
      resultValue = guardrail.run(context)
    } catch (err) {
      // Guardrail threw — treat based on strategy
      const errorMsg = err instanceof Error ? err.message : String(err)
      resultValue = {
        passed: guardrail.strategy === 'fail_open',
        score: 0,
        name: guardrail.name,
        details: `Guardrail error: ${errorMsg}`,
        strategy: guardrail.strategy,
      }
    }

    const latencyMs = Math.round(performance.now() - startTime)
    results.push(resultValue)

    if (!resultValue.passed && resultValue.strategy === 'fail_closed') {
      blockingFailures.push(resultValue)
    }

    // Persist if store provided
    if (options?.store && options.traceId) {
      options.store.record({
        traceId: options.traceId,
        name: resultValue.name,
        position: guardrail.position,
        passed: resultValue.passed,
        score: resultValue.score,
        latencyMs,
        strategy: resultValue.strategy,
        details: resultValue.details,
      })
    }

    log.debug('guardrail:executed', {
      name: resultValue.name,
      passed: resultValue.passed,
      score: resultValue.score,
      strategy: resultValue.strategy,
      latencyMs,
    })
  }

  const allPassed = results.every((r) => r.passed)

  return { results, allPassed, blockingFailures }
}

// ── GuardrailStore (persistence) ───────────────────────

export class GuardrailStore {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /** Record a guardrail execution. */
  record(entry: GuardrailRecordInput): void {
    const id = generateId('guard')
    const createdAt = now()

    this.db
      .prepare(
        `INSERT INTO guardrail_executions (id, trace_id, name, position, passed, score, latency_ms, strategy, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        entry.traceId,
        entry.name,
        entry.position,
        entry.passed ? 1 : 0,
        entry.score,
        entry.latencyMs,
        entry.strategy,
        entry.details,
        createdAt,
      )
  }

  /** Get all guardrail executions for a trace. */
  getByTrace(traceId: string): GuardrailExecutionRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM guardrail_executions WHERE trace_id = ? ORDER BY created_at ASC')
      .all(traceId) as GuardrailRow[]

    return rows.map((r) => this.mapRow(r))
  }

  /** Compute pass rate (0-1) for a trace's guardrails. */
  getPassRate(traceId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as total, SUM(passed) as passed_count
       FROM guardrail_executions WHERE trace_id = ?`,
      )
      .get(traceId) as { total: number; passed_count: number }

    if (row.total === 0) return 1
    return row.passed_count / row.total
  }

  private mapRow(row: GuardrailRow): GuardrailExecutionRecord {
    return {
      id: row.id,
      traceId: row.trace_id,
      name: row.name,
      position: row.position,
      passed: row.passed === 1,
      score: row.score,
      latencyMs: row.latency_ms,
      strategy: row.strategy,
      details: row.details,
      createdAt: row.created_at,
    }
  }
}
