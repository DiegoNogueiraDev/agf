/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * runs store — persists first-class runs (the diagram's HARNESS → storage box)
 * so `agf session show` can reflect the active run. Function-based DB store
 * mirroring src/core/store/episodic-outcomes-store.ts.
 */

import type Database from 'better-sqlite3'
import { RunSchema, type Run } from '../../schemas/session.schema.js'

/** Statuses considered "active" for the purpose of `getActiveRun`. */
const ACTIVE_STATUSES = ['pending', 'active', 'paused'] as const

/** Insert or replace a run. `sessionId` links it to a session for lookup. */
export function upsertRun(db: Database.Database, run: Run, sessionId?: string | null): void {
  db.prepare(
    `INSERT OR REPLACE INTO runs (run_id, status, started_at, ended_at, budget, session_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(run.runId, run.status, run.startedAt, run.endedAt, JSON.stringify(run.budget), sessionId ?? null, run.startedAt)
}

interface RunRow {
  run_id: string
  status: string
  started_at: number
  ended_at: number | null
  budget: string
}

/** Most-recent non-terminal run (optionally for a session), or null when none. */
export function getActiveRun(db: Database.Database, sessionId?: string): Run | null {
  const placeholders = ACTIVE_STATUSES.map(() => '?').join(', ')
  const where = sessionId ? `WHERE session_id = ? AND status IN (${placeholders})` : `WHERE status IN (${placeholders})`
  const params: Array<string> = sessionId ? [sessionId, ...ACTIVE_STATUSES] : [...ACTIVE_STATUSES]
  const row = db
    .prepare(`SELECT run_id, status, started_at, ended_at, budget FROM runs ${where} ORDER BY created_at DESC LIMIT 1`)
    .get(...params) as RunRow | undefined
  if (!row) return null
  const parsed = RunSchema.safeParse({
    runId: row.run_id,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    budget: JSON.parse(row.budget) as unknown,
  })
  return parsed.success ? parsed.data : null
}
