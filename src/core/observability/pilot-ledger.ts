/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Pilot ledger — records token usage reported by external pilots (Claude/Copilot/Codex)
 * via `agf submit --result '{"usage":{"tokens_in":N,"tokens_out":N,"model":"..."}}'`.
 *
 * Uses the existing llm_call_ledger table with caller='pilot' to keep all cost data
 * in one place. summarizePilotLedger aggregates only pilot rows for the "Pilot Economy"
 * block in `agf savings`.
 */
import type Database from 'better-sqlite3'
import { recordModelCall } from './llm-call-ledger.js'

export interface PilotCallRow {
  nodeId: string
  tokensIn: number
  tokensOut: number
  model: string
  sessionId: string
}

export interface PilotLedgerSummary {
  total: number
  tokensIn: number
  tokensOut: number
  costUsd: number
  calls: number
}

/** Writes a pilot token call into llm_call_ledger with caller='pilot'. */
export function recordPilotCall(db: Database.Database, row: PilotCallRow): void {
  recordModelCall(db, {
    sessionId: row.sessionId,
    nodeId: row.nodeId,
    provider: 'pilot',
    model: row.model,
    inputTokens: row.tokensIn,
    outputTokens: row.tokensOut,
    caller: 'pilot',
  })
}

/** Aggregates all pilot calls from llm_call_ledger for the Pilot Economy block. */
export function summarizePilotLedger(db: Database.Database): PilotLedgerSummary {
  const row = db
    .prepare(
      `SELECT
        COUNT(*) AS calls,
        COALESCE(SUM(input_tokens), 0) AS tin,
        COALESCE(SUM(output_tokens), 0) AS tout,
        COALESCE(SUM(cost_usd), 0) AS cost
       FROM llm_call_ledger
       WHERE caller = 'pilot'`,
    )
    .get() as { calls: number; tin: number; tout: number; cost: number } | undefined

  if (!row) return { total: 0, tokensIn: 0, tokensOut: 0, costUsd: 0, calls: 0 }
  return {
    total: row.tin + row.tout,
    tokensIn: row.tin,
    tokensOut: row.tout,
    costUsd: row.cost,
    calls: row.calls,
  }
}
