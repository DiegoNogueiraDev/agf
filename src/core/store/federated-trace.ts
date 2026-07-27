/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Federated Trace — cross-store observability for federated queries.
 *
 * Wraps federatedQuery with a per-invocation trace that records:
 *   - Unique trace_id per query
 *   - Each store consulted in order with latency (ms) and result count
 *   - Failure cause when a store is unavailable (partial=true)
 *
 * The trace structure is deterministic for identical inputs:
 * same stores, same query → same step order, same result counts.
 */

import { generateId } from '../utils/id.js'
import { createLogger } from '../utils/logger.js'
import type { StoreAdapter, StoreId, FederatedResultItem } from './federated-query.js'

const log = createLogger({ layer: 'core', source: 'federated-trace.ts' })

export interface TraceStep {
  readonly storeId: StoreId
  readonly latencyMs: number
  readonly resultCount: number
  /** Present only when the store threw an error */
  readonly error?: string
}

export interface FederatedTrace {
  readonly traceId: string
  /** True when at least one store failed */
  readonly partial: boolean
  readonly steps: TraceStep[]
}

export interface TracedFederatedResult {
  readonly items: FederatedResultItem[]
  readonly warnings: string[]
  readonly trace: FederatedTrace
}

export interface TracedQueryInput {
  readonly query: string
  readonly stores?: StoreId[]
}

/**
 * Execute a federated query with full cross-store tracing.
 * Each store is queried sequentially (to preserve insertion order in trace)
 * with per-store latency measurement.
 */
export async function tracedFederatedQuery(
  input: TracedQueryInput,
  adapters: StoreAdapter[],
): Promise<TracedFederatedResult> {
  const traceId = generateId()
  const requested = new Set(input.stores ?? adapters.map((a) => a.storeId))
  const active = adapters.filter((a) => requested.has(a.storeId))

  const items: FederatedResultItem[] = []
  const warnings: string[] = []
  const steps: TraceStep[] = []
  let partial = false

  // Sequential to preserve deterministic order in trace
  for (const adapter of active) {
    const t0 = Date.now()
    try {
      const results = await adapter.query(input.query)
      const latencyMs = Date.now() - t0
      for (const dataValue of results) {
        items.push({ data: dataValue, source_store: adapter.storeId })
      }
      steps.push({ storeId: adapter.storeId, latencyMs, resultCount: results.length })
    } catch (err) {
      const latencyMs = Date.now() - t0
      const msg = err instanceof Error ? err.message : String(err)
      partial = true
      warnings.push(`Store "${adapter.storeId}" unavailable: ${msg}`)
      steps.push({ storeId: adapter.storeId, latencyMs, resultCount: 0, error: msg })
      log.warn('federated-trace:store_offline', { traceId, storeId: adapter.storeId, error: msg })
    }
  }

  return {
    items,
    warnings,
    trace: { traceId, partial, steps },
  }
}
