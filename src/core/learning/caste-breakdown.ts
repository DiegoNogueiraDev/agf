/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type Database from 'better-sqlite3'

export interface CasteBreakdown {
  caste: string
  record_count: number
  accuracy: number
  failure_rate: number
  avg_cycle_time_ms: number
}

interface PerfRow {
  caste: string
  record_count: number
  passed_count: number
  avg_cycle_time_ms: number
}

export function aggregateCasteBreakdown(db: Database.Database, projectId: string): CasteBreakdown[] {
  let rows: PerfRow[]
  try {
    rows = db
      .prepare(
        `SELECT
          caste,
          COUNT(*)                       AS record_count,
          SUM(ac_passed)                 AS passed_count,
          AVG(cycle_time_ms)             AS avg_cycle_time_ms
         FROM perf_records
         WHERE project_id = ? AND caste IS NOT NULL
         GROUP BY caste
         ORDER BY record_count DESC`,
      )
      .all(projectId) as PerfRow[]
  } catch {
    return []
  }

  return rows.map((r) => {
    const accuracy = r.record_count > 0 ? r.passed_count / r.record_count : 0
    return {
      caste: r.caste,
      record_count: r.record_count,
      accuracy,
      failure_rate: 1 - accuracy,
      avg_cycle_time_ms: r.avg_cycle_time_ms,
    }
  })
}
