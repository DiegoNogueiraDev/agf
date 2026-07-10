/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 *
 *
 * Boundary coercion / validation for CLI flag values. These are the deterministic
 * guards that keep raw, agent-supplied argv (which may be non-numeric, blank, or
 * malformed) from reaching the store as `NaN` and surfacing as a raw `SqliteError`
 * instead of the `{ ok:false }` envelope contract.
 */

/**
 * Coerce a `--limit`-style flag to a non-negative integer.
 *
 * Returns `fallback` for `undefined`, blank, non-finite (`NaN`/`Infinity`),
 * or negative inputs. Finite values are truncated to an integer.
 */
export function coerceLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  const i = Math.trunc(n)
  return i >= 0 ? i : fallback
}

/**
 * Coerce a numeric id flag (e.g. snapshot id) to a non-negative integer, or
 * `null` when the input is blank or not a finite integer.
 */
export function coerceId(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : null
}

export type PriorityResult = { ok: true; value: number } | { ok: false }

/**
 * Validate a `--priority` flag as an integer in the inclusive range 1–5.
 *
 * Returns `{ ok:false }` for anything outside that range (including `NaN`),
 * which the caller surfaces as `INVALID_INPUT` instead of persisting `NULL`.
 */
export function coercePriority(raw: string | undefined): PriorityResult {
  if (raw === undefined) return { ok: false }
  const n = Number(raw)
  if (Number.isInteger(n) && n >= 1 && n <= 5) return { ok: true, value: n }
  return { ok: false }
}

/** True when a string is undefined or contains only whitespace. */
export function isBlank(s: string | undefined): boolean {
  return s === undefined || s.trim() === ''
}

/** Narrow an unknown caught value to a human-readable message. */
export function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Minimal boundary shape-check for an imported graph document. A full
 * `GraphDocumentSchema.parse` happens downstream in `mergeGraph`; this guard
 * gives a friendly early `INVALID_GRAPH` message for obviously-wrong JSON
 * (e.g. an array, a string, or a payload missing `nodes`/`edges`).
 */
export function isGraphDocumentShape(v: unknown): boolean {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false
  const o = v as Record<string, unknown>
  return Array.isArray(o.nodes) && Array.isArray(o.edges) && typeof o.project === 'object' && o.project !== null
}
