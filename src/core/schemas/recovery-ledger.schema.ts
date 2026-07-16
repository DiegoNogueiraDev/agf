/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §T3 — Persisted Recovery Ledger: SQLite-backed attempt tracking
 * para o RecoveryRecipeEngine. Timestamps, estado, escalation_reason.
 */

import type Database from 'better-sqlite3'
import { createDatabase } from '../store/database-factory.js'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface RecoveryAttempt {
  id?: number
  errorKind: string
  operation: string
  target: string
  retryable: boolean
  escalation: string
  attemptNumber?: number
  timestamp?: number
}

export interface RecoveryFilter {
  errorKind?: string
  limit?: number
}

export class RecoveryLedger {
  private db: Database.Database

  constructor(dbPath: string) {
    const dir = dirname(dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    this.db = createDatabase(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS recovery_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        error_kind TEXT NOT NULL,
        operation TEXT NOT NULL,
        target TEXT NOT NULL,
        retryable INTEGER NOT NULL DEFAULT 1,
        escalation TEXT NOT NULL DEFAULT 'LogAndContinue',
        attempt_number INTEGER NOT NULL DEFAULT 1,
        timestamp INTEGER NOT NULL
      )
    `)
  }

  record(attempt: Omit<RecoveryAttempt, 'id' | 'attemptNumber' | 'timestamp'>): RecoveryAttempt {
    const prevCount = this.count(attempt.errorKind)
    const attemptNumber = prevCount + 1
    const timestamp = Date.now()

    const stmt = this.db.prepare(`
      INSERT INTO recovery_ledger (error_kind, operation, target, retryable, escalation, attempt_number, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      attempt.errorKind,
      attempt.operation,
      attempt.target,
      attempt.retryable ? 1 : 0,
      attempt.escalation,
      attemptNumber,
      timestamp,
    )

    return {
      id: Number(result.lastInsertRowid),
      ...attempt,
      attemptNumber,
      timestamp,
    }
  }

  list(filter?: RecoveryFilter): RecoveryAttempt[] {
    let query = 'SELECT * FROM recovery_ledger'
    const params: unknown[] = []

    if (filter?.errorKind) {
      query += ' WHERE error_kind = ?'
      params.push(filter.errorKind)
    }

    query += ' ORDER BY timestamp DESC'

    if (filter?.limit) {
      query += ' LIMIT ?'
      params.push(filter.limit)
    }

    const rows = this.db.prepare(query).all(...params) as Array<Record<string, unknown>>
    return rows.map(this.mapRow)
  }

  count(errorKind: string): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM recovery_ledger WHERE error_kind = ?').get(errorKind) as {
      n: number
    }
    return row.n
  }

  reset(errorKind: string): void {
    this.db.prepare('DELETE FROM recovery_ledger WHERE error_kind = ?').run(errorKind)
  }

  resetAll(): void {
    this.db.prepare('DELETE FROM recovery_ledger').run()
  }

  close(): void {
    this.db.close()
  }

  private mapRow(row: Record<string, unknown>): RecoveryAttempt {
    return {
      id: row.id as number,
      errorKind: row.error_kind as string,
      operation: row.operation as string,
      target: row.target as string,
      retryable: (row.retryable as number) === 1,
      escalation: row.escalation as string,
      attemptNumber: row.attempt_number as number,
      timestamp: row.timestamp as number,
    }
  }
}
