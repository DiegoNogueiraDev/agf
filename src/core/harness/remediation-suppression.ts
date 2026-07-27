/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Suppression Store — Persists (file, violationType) pairs that should be excluded
 * from remediation suggestions. Part of the Zero False-Positive guarantee (Layer 3).
 *
 * Uses remediation_suppressions table (migration v36).
 */

import { randomUUID } from 'crypto'
import type Database from 'better-sqlite3'

export interface SuppressionRecord {
  id: string
  file: string
  violationType: string
  dimension: string
  reason: string | null
  suppressedAt: string
}

export class SuppressionStore {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /** Suppress a (file, violationType) pair. Idempotent — no error on duplicate. */
  suppress(file: string, violationType: string, dimension: string, reason?: string): void {
    this.db
      .prepare(
        `
      INSERT OR IGNORE INTO remediation_suppressions (id, file, violation_type, dimension, reason, suppressed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(randomUUID(), file, violationType, dimension, reason ?? null, new Date().toISOString())
  }

  /** Check if a (file, violationType) pair is suppressed. */
  isSuppressed(file: string, violationType: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM remediation_suppressions WHERE file = ? AND violation_type = ? LIMIT 1')
      .get(file, violationType)
    return row !== undefined
  }

  /** List all active suppressions. */
  listSuppressions(): SuppressionRecord[] {
    const rows = this.db
      .prepare(
        'SELECT id, file, violation_type, dimension, reason, suppressed_at FROM remediation_suppressions ORDER BY suppressed_at DESC',
      )
      .all() as Array<{
      id: string
      file: string
      violation_type: string
      dimension: string
      reason: string | null
      suppressed_at: string
    }>

    return rows.map((r) => ({
      id: r.id,
      file: r.file,
      violationType: r.violation_type,
      dimension: r.dimension,
      reason: r.reason,
      suppressedAt: r.suppressed_at,
    }))
  }

  /** Remove a suppression by ID. */
  removeSuppression(id: string): void {
    this.db.prepare('DELETE FROM remediation_suppressions WHERE id = ?').run(id)
  }
}
