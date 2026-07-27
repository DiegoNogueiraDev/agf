/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §SprintD — Lifecycle Health Snapshots store.
 *
 * Thin wrapper over the lifecycle_health_snapshots table (migration v84).
 * Each snapshot persists the full `LifecycleHealthReport` JSON plus a
 * denormalized `passed_all` flag so the rolling `analyze(success_rate)`
 * query stays a fast SUM/COUNT on an indexed column.
 *
 * Idempotent per (epic_id, taken_on day): two recordSnapshot() calls in
 * the same day collapse to one row via the UNIQUE index, keeping the
 * window math unbiased by intra-day re-runs.
 */

import type Database from 'better-sqlite3'
import { generateId } from '../utils/id.js'
import type { LifecycleHealthReport } from './prd-lifecycle-health.js'

export interface LifecycleHealthSnapshot {
  readonly id: string
  readonly epicId: string | null
  readonly snapshot: LifecycleHealthReport
  readonly passedAll: boolean
  readonly takenAt: string
  readonly takenOn: string
}

export interface SuccessRateReport {
  readonly window: number
  readonly samples: number
  readonly passed: number
  readonly successRate: number
  readonly latestPassedAll: boolean | null
  readonly summary: string
}

function toIsoDay(iso: string): string {
  return iso.slice(0, 10)
}

/**
 * Persist a LifecycleHealthReport. Re-running the same day for the same
 * epic_id (or for the project-wide null epic) overwrites the prior row
 * — last write wins.
 */
export function recordSnapshot(
  db: Database.Database,
  report: LifecycleHealthReport,
  takenAt: string = new Date().toISOString(),
): LifecycleHealthSnapshot {
  const id = generateId('lhs')
  const epicId = report.epicId ?? null
  const takenOn = toIsoDay(takenAt)
  const snapshotJson = JSON.stringify(report)
  const passedAll = report.passedAll ? 1 : 0

  db.prepare(
    `INSERT INTO lifecycle_health_snapshots
       (id, epic_id, snapshot_json, passed_all, taken_at, taken_on)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(COALESCE(epic_id, ''), taken_on) DO UPDATE SET
       snapshot_json = excluded.snapshot_json,
       passed_all    = excluded.passed_all,
       taken_at      = excluded.taken_at`,
  ).run(id, epicId, snapshotJson, passedAll, takenAt, takenOn)

  return { id, epicId, snapshot: report, passedAll: report.passedAll, takenAt, takenOn }
}

interface SnapshotRow {
  passed_all: number
  taken_at: string
}

/**
 * Compute pass-rate over the most recent N snapshots (default 10).
 * `epicId=null` aggregates across the whole project.
 */
export function computeSuccessRate(
  db: Database.Database,
  options: { window?: number; epicId?: string | null } = {},
): SuccessRateReport {
  const window = Math.max(1, options.window ?? 10)
  const rows =
    options.epicId !== undefined && options.epicId !== null
      ? (db
          .prepare(
            `SELECT passed_all, taken_at FROM lifecycle_health_snapshots
              WHERE epic_id = ?
              ORDER BY taken_at DESC LIMIT ?`,
          )
          .all(options.epicId, window) as SnapshotRow[])
      : (db
          .prepare(
            `SELECT passed_all, taken_at FROM lifecycle_health_snapshots
              ORDER BY taken_at DESC LIMIT ?`,
          )
          .all(window) as SnapshotRow[])

  const samples = rows.length
  const passed = rows.filter((r) => r.passed_all === 1).length
  const successRate = samples > 0 ? passed / samples : 0
  const latestPassedAll = samples > 0 ? rows[0].passed_all === 1 : null

  const summary =
    samples === 0
      ? 'no lifecycle-health snapshots recorded yet'
      : `${passed}/${samples} snapshots passed all 9 phases (${Math.round(successRate * 100)}%)`

  return { window, samples, passed, successRate, latestPassedAll, summary }
}
