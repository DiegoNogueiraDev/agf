/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Harness Evolution Report — Compare baselines across phases
 *
 * Compares earliest and latest harness_history records to show
 * overall score evolution and direction.
 */

import type Database from 'better-sqlite3'

export interface EvolutionReport {
  earliest: { score: number; timestamp: string }
  latest: { score: number; timestamp: string }
  delta: number
  direction: 'improving' | 'declining' | 'stable'
}

/** getEvolutionReport —  */
export function getEvolutionReport(db: Database.Database, projectId: string = 'proj_local'): EvolutionReport | null {
  const rows = db
    .prepare('SELECT score, timestamp FROM harness_history WHERE project_id = ? ORDER BY timestamp ASC')
    .all(projectId) as Array<{ score: number; timestamp: string }>

  if (rows.length < 2) return null

  const earliest = rows[0]
  const latest = rows[rows.length - 1]
  const delta = Math.round((latest.score - earliest.score) * 10) / 10

  let direction: EvolutionReport['direction']
  if (delta > 2) direction = 'improving'
  else if (delta < -2) direction = 'declining'
  else direction = 'stable'

  return { earliest, latest, delta, direction }
}
