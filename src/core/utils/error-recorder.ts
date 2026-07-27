/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-22.B1 — Error pattern recorder.
 * Persists classified errors into error_patterns (migration v77) so adaptive
 * retry policy (B2) can escalate when the same pattern recurs ≥ N times.
 */

import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { classifyError, type ErrorCategory } from './error-classifier.js'

export interface ErrorPatternRecord {
  errorHash: string
  category: ErrorCategory
  count: number
  firstSeen: string
  lastSeen: string
}

/** Stable SHA-1 hash of the (normalized) error message — collapses transient digits. */
export function hashError(message: string): string {
  const normalized = message
    .replace(/0x[0-9a-f]+/gi, '0xHEX')
    .replace(/\b\d{4,}\b/g, 'N')
    .trim()
    .toLowerCase()
  return createHash('sha1').update(normalized).digest('hex').slice(0, 16)
}

/**
 * Record an error occurrence. UPSERTs into error_patterns:
 * - first occurrence → INSERT count=1
 * - subsequent       → count+1, last_seen=now
 */
export function recordError(db: Database.Database, err: Error | unknown): ErrorPatternRecord {
  const message = err instanceof Error ? err.message : String(err ?? '')
  const classification = classifyError(err)
  const errorHash = hashError(message)
  const now = new Date().toISOString()

  const existing = db.prepare(`SELECT count, first_seen FROM error_patterns WHERE error_hash = ?`).get(errorHash) as
    { count: number; first_seen: string } | undefined

  if (existing) {
    db.prepare(`UPDATE error_patterns SET count = count + 1, last_seen = ? WHERE error_hash = ?`).run(now, errorHash)
    return {
      errorHash,
      category: classification.category,
      count: existing.count + 1,
      firstSeen: existing.first_seen,
      lastSeen: now,
    }
  }

  const id = `err-${errorHash}`
  db.prepare(
    `INSERT INTO error_patterns (id, error_hash, category, message, count, first_seen, last_seen)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
  ).run(id, errorHash, classification.category, message.slice(0, 500), now, now)

  return {
    errorHash,
    category: classification.category,
    count: 1,
    firstSeen: now,
    lastSeen: now,
  }
}

/** Fetch a pattern by hash (helper for adaptive retry policy in B2). */
export function getErrorPattern(db: Database.Database, errorHash: string): ErrorPatternRecord | undefined {
  const row = db
    .prepare(
      `SELECT error_hash, category, count, first_seen, last_seen
       FROM error_patterns WHERE error_hash = ?`,
    )
    .get(errorHash) as
    { error_hash: string; category: string; count: number; first_seen: string; last_seen: string } | undefined
  if (!row) return undefined
  return {
    errorHash: row.error_hash,
    category: row.category as ErrorCategory,
    count: row.count,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
  }
}
