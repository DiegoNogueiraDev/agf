/*!
 * Cache statistics aggregation from llm_call_ledger (Task 4.3).
 *
 * Role: compute cache hit/miss counts, token savings, and estimated USD savings
 * from the llm_call_ledger table. A "cache hit" is a row where
 * cached_input_tokens > 0; a miss is null or 0.
 *
 * Savings estimate: cached tokens × input price rate × CACHE_DISCOUNT_RATIO.
 * Uses CACHE_DISCOUNT_RATIO and DEFAULT_INPUT_RATE_USD_PER_TOKEN from
 * cost-aggregator.ts (single source of truth for these constants).
 *
 * Composes with: cost-aggregator.ts (constants), llm_call_ledger (SQL).
 */

import type Database from 'better-sqlite3'
import { CACHE_DISCOUNT_RATIO, DEFAULT_INPUT_RATE_USD_PER_TOKEN } from './cost-aggregator.js'

export interface CacheStats {
  /** Fraction of calls with at least one cached input token. */
  hitRate: number
  /** Count of calls where cached_input_tokens > 0. */
  totalHits: number
  /** Count of calls where cached_input_tokens is null or 0. */
  totalMisses: number
  /** Total cached input tokens across all calls. */
  tokensSaved: number
  /** Estimated USD saved via cache discount (tokensSaved × rate × CACHE_DISCOUNT_RATIO). */
  estimatedSavingsUsd: number
}

interface LedgerRow {
  cached_input_tokens: number | null
}

/** Compute prompt-cache statistics from llm_call_ledger. Pure SQL aggregation, read-only. */
export function computeCacheStats(db: Database.Database): CacheStats {
  const rows = db.prepare('SELECT cached_input_tokens FROM llm_call_ledger').all() as LedgerRow[]

  if (rows.length === 0) {
    return { hitRate: 0, totalHits: 0, totalMisses: 0, tokensSaved: 0, estimatedSavingsUsd: 0 }
  }

  let totalHits = 0
  let totalMisses = 0
  let tokensSaved = 0

  for (const row of rows) {
    const cached = row.cached_input_tokens ?? 0
    if (cached > 0) {
      totalHits++
      tokensSaved += cached
    } else {
      totalMisses++
    }
  }

  const totalCalls = totalHits + totalMisses
  const hitRate = totalCalls > 0 ? totalHits / totalCalls : 0
  const estimatedSavingsUsd = tokensSaved * DEFAULT_INPUT_RATE_USD_PER_TOKEN * CACHE_DISCOUNT_RATIO

  return { hitRate, totalHits, totalMisses, tokensSaved, estimatedSavingsUsd }
}
