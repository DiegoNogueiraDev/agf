/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-12.T09 — Slow query detector.
 * Pure decision: dado durationMs e thresholdMs, decide se a query é lenta.
 * Sanitiza params para tipos (sem valores) — caller (SqliteStore.prepare)
 * loga via logger.warn ao receber slow=true.
 */

export const DEFAULT_SLOW_QUERY_MS = 500

export interface SlowQueryInput {
  sql: string
  durationMs: number
  params?: unknown[]
  thresholdMs?: number
}

export interface SlowQueryReport {
  slow: boolean
  thresholdMs: number
  durationMs: number
  sqlPreview: string
  paramTypes: string[]
}

/** getSlowQueryThreshold —  */
export function getSlowQueryThreshold(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SQLITE_SLOW_QUERY_MS
  if (!raw) return DEFAULT_SLOW_QUERY_MS
  const nVar = Number(raw)
  return Number.isFinite(nVar) && nVar > 0 ? nVar : DEFAULT_SLOW_QUERY_MS
}

/** sanitizeParamTypes —  */
export function sanitizeParamTypes(params: unknown[] | undefined): string[] {
  if (!params) return []
  return params.map((p) => {
    if (p === null) return 'null'
    if (p instanceof Date) return 'Date'
    if (Array.isArray(p)) return 'array'
    if (Buffer.isBuffer(p)) return 'Buffer'
    return typeof p
  })
}

/** Truncate SQL to a sane length and collapse whitespace for log noise. */
export function previewSql(sql: string, maxChars: number = 200): string {
  const collapsed = sql.replace(/\s+/g, ' ').trim()
  return collapsed.length <= maxChars ? collapsed : `${collapsed.slice(0, maxChars - 3)}...`
}

/** checkSlowQuery —  */
export function checkSlowQuery(input: SlowQueryInput): SlowQueryReport {
  const threshold = input.thresholdMs ?? DEFAULT_SLOW_QUERY_MS
  return {
    slow: input.durationMs > threshold,
    thresholdMs: threshold,
    durationMs: input.durationMs,
    sqlPreview: previewSql(input.sql),
    paramTypes: sanitizeParamTypes(input.params),
  }
}
