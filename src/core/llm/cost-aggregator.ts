/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-11.T04 — Cost aggregator for the metrics tool.
 * Two reports off llm_call_ledger:
 *   - cost_by_node: {totalUsd, callCount, byProvider, byModel} for a node
 *     plus its descendants (closure via parent_id self-join).
 *   - session_cost: same shape plus savedViaCacheUsd estimate based on
 *     CACHE_DISCOUNT_RATIO (cache reads cost ~10% of input price → 90% saved).
 *
 * Pure read-only SQL aggregations. Tool wrapper is thin orchestration.
 */

import type Database from 'better-sqlite3'
export { measureStreamTps, type StreamTpsResult } from './stream-tps.js'

export const CACHE_DISCOUNT_RATIO = 0.9
export const DEFAULT_INPUT_RATE_USD_PER_TOKEN = 3 / 1_000_000

export interface CostBreakdown {
  totalUsd: number
  callCount: number
  byProvider: Record<string, number>
  byModel: Record<string, number>
}

export interface SessionCost extends CostBreakdown {
  savedViaCacheUsd: number
  cachedTokensTotal: number
}

interface LedgerRow {
  cost_usd: number
  provider: string
  model: string
  cached_input_tokens: number | null
}

function aggregate(rows: LedgerRow[]): CostBreakdown {
  const out: CostBreakdown = { totalUsd: 0, callCount: 0, byProvider: {}, byModel: {} }
  for (const rVar of rows) {
    out.totalUsd += rVar.cost_usd
    out.callCount++
    out.byProvider[rVar.provider] = (out.byProvider[rVar.provider] ?? 0) + rVar.cost_usd
    out.byModel[rVar.model] = (out.byModel[rVar.model] ?? 0) + rVar.cost_usd
  }
  return out
}

/** Recursive CTE on nodes(parent_id) to include all descendants of nodeId. */
export function costByNode(db: Database.Database, nodeId: string): CostBreakdown {
  const rows = db
    .prepare(
      `WITH RECURSIVE descendants(id) AS (
         SELECT id FROM nodes WHERE id = ?
         UNION ALL
         SELECT n.id FROM nodes n JOIN descendants d ON n.parent_id = d.id
       )
       SELECT cost_usd, provider, model, cached_input_tokens
       FROM llm_call_ledger
       WHERE node_id IN (SELECT id FROM descendants)`,
    )
    .all(nodeId) as LedgerRow[]
  return aggregate(rows)
}

export interface SessionCostOptions {
  runId?: string
  inputRateUsdPerToken?: number
}

/** sessionCost —  */
export function sessionCost(db: Database.Database, opts: SessionCostOptions = {}): SessionCost {
  const params: Array<string | number> = []
  let where = ''
  if (opts.runId) {
    where = 'WHERE run_id = ?'
    params.push(opts.runId)
  }
  const rows = db
    .prepare(
      `SELECT cost_usd, provider, model, cached_input_tokens
       FROM llm_call_ledger ${where}`,
    )
    .all(...params) as LedgerRow[]

  const base = aggregate(rows)
  const cachedTokensTotal = rows.reduce((sum, r) => sum + (r.cached_input_tokens ?? 0), 0)
  const rate = opts.inputRateUsdPerToken ?? DEFAULT_INPUT_RATE_USD_PER_TOKEN
  const savedViaCacheUsd = cachedTokensTotal * rate * CACHE_DISCOUNT_RATIO
  return { ...base, savedViaCacheUsd, cachedTokensTotal }
}
