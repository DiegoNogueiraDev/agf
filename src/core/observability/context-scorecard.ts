/*!
 * context-scorecard — tokens-vs-resolve view for agf metrics --select data.context.
 *
 * WHY: Agents need a quick read on whether their token spend correlates with
 * task completion. This joins llm_call_ledger with nodes to compute resolveRate,
 * avgTokensResolved, and avgTokensFailed — the B2 context context scorecard.
 *
 * Composes with: llm-call-ledger.ts (reads), metrics-cmd.ts (surfaces in envelope).
 * Contract: pure read — never mutates; returns zeros when no data.
 */

import type { Database as BetterSqlite3 } from 'better-sqlite3'

export interface ContextScorecard {
  /** Fraction of nodes with LLM calls that are in 'done' status. 0–1. */
  resolveRate: number
  /** Average total tokens (in+out) for calls whose node is done. 0 if none. */
  avgTokensResolved: number
  /** Average total tokens (in+out) for calls whose node is not done. 0 if none. */
  avgTokensFailed: number
  /** Total distinct node IDs found in the ledger. */
  totalTrackedNodes: number
  /** Number of tracked nodes that reached done. */
  resolvedNodes: number
}

/**
 * Compute the context scorecard by joining llm_call_ledger with the nodes table.
 * Safe to call on any DB that has run migrations (both tables exist).
 */
export function buildContextScorecard(db: BetterSqlite3): ContextScorecard {
  type LedgerRow = { node_id: string; total_tokens: number }
  type NodeRow = { id: string; status: string }

  // Aggregate tokens per unique node_id from the ledger
  const ledgerRows = db
    .prepare(
      `SELECT node_id,
              SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) AS total_tokens
       FROM llm_call_ledger
       WHERE node_id IS NOT NULL
       GROUP BY node_id`,
    )
    .all() as LedgerRow[]

  if (ledgerRows.length === 0) {
    return { resolveRate: 0, avgTokensResolved: 0, avgTokensFailed: 0, totalTrackedNodes: 0, resolvedNodes: 0 }
  }

  // Fetch status for each node_id from the nodes table
  const nodeIds = ledgerRows.map((r) => r.node_id)
  const placeholders = nodeIds.map(() => '?').join(',')
  const nodeRows = db.prepare(`SELECT id, status FROM nodes WHERE id IN (${placeholders})`).all(...nodeIds) as NodeRow[]

  const statusMap = new Map(nodeRows.map((n) => [n.id, n.status]))

  let resolvedCount = 0
  let resolvedTokens = 0
  let failedTokens = 0
  let failedCount = 0

  for (const row of ledgerRows) {
    const status = statusMap.get(row.node_id)
    if (status === 'done' || status === 'satisfied') {
      resolvedCount++
      resolvedTokens += row.total_tokens
    } else {
      failedCount++
      failedTokens += row.total_tokens
    }
  }

  const total = ledgerRows.length
  return {
    resolveRate: resolvedCount / total,
    avgTokensResolved: resolvedCount > 0 ? resolvedTokens / resolvedCount : 0,
    avgTokensFailed: failedCount > 0 ? failedTokens / failedCount : 0,
    totalTrackedNodes: total,
    resolvedNodes: resolvedCount,
  }
}
