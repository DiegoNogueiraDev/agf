/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * lock-error — classify a SQLite "database is locked" error so the CLI can fail
 * loud instead of surfacing an empty envelope.
 *
 * WHY: under a held write lock (BEGIN IMMEDIATE) or a stale WAL, a store access
 * can throw SQLITE_BUSY. If that error is swallowed or mapped to a generic
 * `UNCAUGHT`, an agent caller cannot tell a lock apart from "no data" — the
 * original symptom this fixes. This pure classifier is the single source of
 * truth for lock detection; consumers (fatal.ts envelope, openStoreOrFail) key
 * their STORE_LOCKED handling off it.
 *
 * Pure (no IO): safe to call from the CLI envelope path and the store boundary.
 */

/** The stable envelope `code` a locked/contended store surfaces to callers. */
export const STORE_LOCKED_CODE = 'STORE_LOCKED'

/** better-sqlite3 lock error codes (reserved/pending/exclusive contention). */
const LOCK_ERROR_CODES = new Set(['SQLITE_BUSY', 'SQLITE_BUSY_SNAPSHOT', 'SQLITE_BUSY_RECOVERY', 'SQLITE_LOCKED'])

/**
 * True when `err` is a SQLite lock/contention error — by driver error code, or
 * by the canonical "database is locked" / "database table is locked" message
 * when the code is absent (some adapters only carry the message).
 */
export function isDatabaseLockedError(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false
  const e = err as { code?: unknown; message?: unknown }
  if (typeof e.code === 'string' && LOCK_ERROR_CODES.has(e.code)) return true
  if (typeof e.message === 'string' && /database (?:table )?is locked/i.test(e.message)) return true
  return false
}
