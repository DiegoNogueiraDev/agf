/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * harness_savings_ledger — DB-side persistence of the savings calculator.
 *
 * Per Eduardo's spec (2026-04-30): every harness block persists one row
 * with REAL token-savings metrics. "Real" = `tokens_consumed` is summed
 * directly from `llm_call_ledger` for the active session, and
 * `baseline_continuation` is the average total spend of past sessions
 * that hit a block of the same type. Confidence scales with sample
 * size; with no history the row still lands so the next block can
 * learn from it.
 *
 * Grounding: Hu et al. 2026 ("Memory in the Age of AI Agents", §4) —
 * each row is *factual memory* (the event happened, here are its
 * numbers) and the aggregate is *experiential memory* (what does this
 * kind of block usually cost?). The dynamics layer is `recordBlock`
 * (formation) → `getBaselineContinuation` (retrieval).
 */

import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { computeSavings } from './savings-calculator.js'

export interface RecordBlockInput {
  projectId: string
  blockType: string
  blockerModule: string
  nodeId?: string
  sessionId?: string
  tokensConsumed: number
  baselineContinuation: number
  baselineN: number
  /** Free-form evidence stored as JSON for later audit. */
  evidence?: Record<string, unknown>
}

export interface BaselineLookup {
  avg: number
  n: number
}

export interface BlockTypeSummary {
  blockType: string
  count: number
  savingsTokens: number
}

export interface SavingsSummary {
  totalSavingsTokens: number
  totalBlocks: number
  byBlockType: BlockTypeSummary[]
}

/** Insert one harness_savings_ledger row, returning the generated id. */
export function recordBlock(db: Database.Database, input: RecordBlockInput): string {
  const estimate = computeSavings({
    blockType: input.blockType,
    tokensConsumed: input.tokensConsumed,
    baselineContinuation: input.baselineContinuation,
    baselineN: input.baselineN,
  })

  const id = `harness_savings_${randomUUID().replace(/-/g, '').slice(0, 16)}`
  const now = new Date().toISOString()
  const evidenceJson = input.evidence ? JSON.stringify(input.evidence) : null

  db.prepare(
    `INSERT INTO harness_savings_ledger
      (id, project_id, block_type, blocker_module, node_id, session_id,
       tokens_consumed, baseline_continuation, baseline_n,
       savings_tokens, confidence, source, evidence_json, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.projectId,
    input.blockType,
    input.blockerModule,
    input.nodeId ?? null,
    input.sessionId ?? null,
    input.tokensConsumed,
    input.baselineContinuation,
    input.baselineN,
    estimate.savingsTokens,
    estimate.confidence,
    estimate.source,
    evidenceJson,
    now,
  )

  return id
}

/**
 * Sum input + output + cache_creation tokens from llm_call_ledger for one
 * session. Returns 0 when no rows match.
 */
export function getSessionTokensConsumed(db: Database.Database, sessionId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(
         SUM(COALESCE(input_tokens, 0)
           + COALESCE(output_tokens, 0)
           + COALESCE(cache_creation_tokens, 0)),
         0) AS total
       FROM llm_call_ledger
       WHERE session_id = ?`,
    )
    .get(sessionId) as { total: number }
  return row.total
}

/**
 * Average past `baseline_continuation` for the given blockType. Returns
 * { avg: 0, n: 0 } when there is no prior history.
 */
export function getBaselineContinuation(db: Database.Database, blockType: string): BaselineLookup {
  const row = db
    .prepare(
      `SELECT AVG(baseline_continuation) AS avg, COUNT(*) AS n
       FROM harness_savings_ledger
       WHERE block_type = ?`,
    )
    .get(blockType) as { avg: number | null; n: number }
  if (!row || row.n === 0) return { avg: 0, n: 0 }
  return { avg: Math.round(row.avg ?? 0), n: row.n }
}

export interface RecordHarnessBlockInput {
  projectId?: string
  blockType: string
  blockerModule: string
  nodeId?: string
  sessionId?: string | null
  evidence?: Record<string, unknown>
}

/**
 * Convenience wrapper for call sites that only know the event identity
 * (which block fired, on which node/session) — derives tokensConsumed from
 * `llm_call_ledger` and baselineContinuation/N from this block type's own
 * history, then records the row. See module doc: the first row for a new
 * blockType lands with zeroes so later blocks of the same type can learn
 * from it.
 */
export function recordHarnessBlock(db: Database.Database, input: RecordHarnessBlockInput): string {
  const tokensConsumed = input.sessionId ? getSessionTokensConsumed(db, input.sessionId) : 0
  const baseline = getBaselineContinuation(db, input.blockType)

  return recordBlock(db, {
    projectId: input.projectId ?? 'proj_local',
    blockType: input.blockType,
    blockerModule: input.blockerModule,
    nodeId: input.nodeId,
    sessionId: input.sessionId ?? undefined,
    tokensConsumed,
    baselineContinuation: baseline.avg,
    baselineN: baseline.n,
    evidence: input.evidence,
  })
}

/** Aggregate totals + per-blockType counters scoped to a project. */
export function aggregateSavings(db: Database.Database, projectId: string): SavingsSummary {
  const totalRow = db
    .prepare(
      `SELECT COALESCE(SUM(savings_tokens), 0) AS total, COUNT(*) AS cnt
       FROM harness_savings_ledger
       WHERE project_id = ?`,
    )
    .get(projectId) as { total: number; cnt: number }

  const groups = db
    .prepare(
      `SELECT block_type, COUNT(*) AS cnt, COALESCE(SUM(savings_tokens), 0) AS total
       FROM harness_savings_ledger
       WHERE project_id = ?
       GROUP BY block_type
       ORDER BY total DESC`,
    )
    .all(projectId) as Array<{ block_type: string; cnt: number; total: number }>

  return {
    totalSavingsTokens: totalRow.total,
    totalBlocks: totalRow.cnt,
    byBlockType: groups.map((g) => ({
      blockType: g.block_type,
      count: g.cnt,
      savingsTokens: g.total,
    })),
  }
}
