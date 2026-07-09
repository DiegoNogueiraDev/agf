/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type Database from 'better-sqlite3'
import { now } from '../utils/time.js'

export interface HookHandlerStats {
  handlerId: string
  callCount: number
  p50Duration: number | null
  p95Duration: number | null
  lastError: string | null
  circuitState: 'closed' | 'open' | 'half-open'
  updatedAt: string
}

interface HookStatsRow {
  handler_id: string
  call_count: number
  p50_duration: number | null
  p95_duration: number | null
  last_error: string | null
  circuit_state: string
  updated_at: string
}

/**
 * DAO over migration v69's hook_handler_stats table. Records per-handler
 * call counts and percentile latencies. Designed for batched writes from
 * HookRegistry.dispatch() — caller decides cadence (e.g. flush every 50
 * calls or 10s).
 */
export class HookStatsStore {
  constructor(private readonly db: Database.Database) {}

  record(handlerId: string, durationMs: number, error?: string | null): void {
    const ts = now()
    const existing = this.get(handlerId)
    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO hook_handler_stats
            (handler_id, call_count, p50_duration, p95_duration, last_error, circuit_state, updated_at)
           VALUES (?, 1, ?, ?, ?, 'closed', ?)`,
        )
        .run(handlerId, durationMs, durationMs, error ?? null, ts)
      return
    }
    // Online EWMA proxy for p50/p95 — exact percentiles would need per-call
    // history; this is good enough for "is this handler hot/slow" UX.
    const p50 = existing.p50Duration === null ? durationMs : 0.7 * existing.p50Duration + 0.3 * durationMs
    const p95 = existing.p95Duration === null ? durationMs : Math.max(durationMs, 0.95 * existing.p95Duration)
    this.db
      .prepare(
        `UPDATE hook_handler_stats
           SET call_count = call_count + 1,
               p50_duration = ?,
               p95_duration = ?,
               last_error = ?,
               updated_at = ?
         WHERE handler_id = ?`,
      )
      .run(p50, p95, error ?? existing.lastError, ts, handlerId)
  }

  setCircuitState(handlerId: string, state: 'closed' | 'open' | 'half-open'): void {
    const ts = now()
    this.db
      .prepare(
        `INSERT INTO hook_handler_stats (handler_id, call_count, circuit_state, updated_at)
         VALUES (?, 0, ?, ?)
         ON CONFLICT(handler_id) DO UPDATE SET circuit_state = excluded.circuit_state, updated_at = excluded.updated_at`,
      )
      .run(handlerId, state, ts)
  }

  get(handlerId: string): HookHandlerStats | null {
    const row = this.db.prepare('SELECT * FROM hook_handler_stats WHERE handler_id = ?').get(handlerId) as
      HookStatsRow | undefined
    return row ? rowToStats(row) : null
  }

  list(): HookHandlerStats[] {
    const rows = this.db.prepare('SELECT * FROM hook_handler_stats ORDER BY call_count DESC').all() as HookStatsRow[]
    return rows.map(rowToStats)
  }
}

function rowToStats(row: HookStatsRow): HookHandlerStats {
  return {
    handlerId: row.handler_id,
    callCount: row.call_count,
    p50Duration: row.p50_duration,
    p95Duration: row.p95_duration,
    lastError: row.last_error,
    circuitState: row.circuit_state as HookHandlerStats['circuitState'],
    updatedAt: row.updated_at,
  }
}
