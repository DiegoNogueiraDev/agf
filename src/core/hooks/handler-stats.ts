/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §HOOKS-INTEGRATION-PRD — Real observability for the `hooks` MCP tool.
 * Pure aggregator: takes per-handler raw call records and produces the
 * stats payload (call_count, p50/p95 duration, last_error, circuit_state).
 * Caller (HookBus / hooks tool) feeds records and renders the response.
 */

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface HandlerCallRecord {
  handlerId: string
  durationMs: number
  ok: boolean
  errorMessage?: string
  ts: number
}

export interface HandlerStats {
  handlerId: string
  callCount: number
  errorCount: number
  p50DurationMs: number
  p95DurationMs: number
  lastError: string | null
  lastErrorTs: number | null
  circuitState: CircuitState
}

export interface HandlerStatsInput {
  records: HandlerCallRecord[]
  /** Optional override per-handler circuit state. Default: 'closed'. */
  circuitStates?: Record<string, CircuitState>
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[rank]
}

function statsForHandler(records: HandlerCallRecord[]): Omit<HandlerStats, 'handlerId' | 'circuitState'> {
  const durations = records.map((r) => r.durationMs).sort((a, b) => a - b)
  const errors = records.filter((r) => !r.ok)
  const lastError = errors[errors.length - 1]
  return {
    callCount: records.length,
    errorCount: errors.length,
    p50DurationMs: percentile(durations, 50),
    p95DurationMs: percentile(durations, 95),
    lastError: lastError?.errorMessage ?? null,
    lastErrorTs: lastError?.ts ?? null,
  }
}

/** Aggregates raw records into per-handler HandlerStats sorted by callCount DESC. */
export function aggregateHandlerStats(input: HandlerStatsInput): HandlerStats[] {
  const byHandler = new Map<string, HandlerCallRecord[]>()
  for (const rVar of input.records) {
    const arr = byHandler.get(rVar.handlerId)
    if (arr) arr.push(rVar)
    else byHandler.set(rVar.handlerId, [rVar])
  }
  const out: HandlerStats[] = []
  for (const [handlerId, recs] of byHandler) {
    out.push({
      handlerId,
      ...statsForHandler(recs),
      circuitState: input.circuitStates?.[handlerId] ?? 'closed',
    })
  }
  return out.sort((a, b) => b.callCount - a.callCount)
}
