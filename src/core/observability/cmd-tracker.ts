/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type Database from 'better-sqlite3'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'cmd-tracker.ts' })

export interface CmdUsageRow {
  id: string
  projectId: string
  command: string
  args: string
  cwd: string
  durationMs: number
  exitCode: number
}

export function trackCommandUsage(db: Database.Database, row: CmdUsageRow): void {
  try {
    db.prepare(
      `INSERT INTO cmd_usage (id, project_id, command, args, cwd, durationMs, exitCode, trackedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(row.id, row.projectId, row.command, row.args, row.cwd, row.durationMs, row.exitCode, Date.now())
    log.debug('cmd-usage:tracked', { command: row.command })
  } catch (err) {
    log.warn('cmd-usage:track-failed', { error: String(err) })
  }
}

export interface CmdFrequency {
  command: string
  count: number
  totalDurationMs: number
  avgDurationMs: number
  lastUsed: number
}

export function getFrequencies(db: Database.Database, projectId: string, topN = 10): CmdFrequency[] {
  try {
    return db
      .prepare(
        `SELECT command, COUNT(*) as count, SUM(durationMs) as totalDurationMs,
                AVG(durationMs) as avgDurationMs, MAX(trackedAt) as lastUsed
         FROM cmd_usage
         WHERE project_id = ?
         GROUP BY command
         ORDER BY count DESC
         LIMIT ?`,
      )
      .all(projectId, topN) as CmdFrequency[]
  } catch {
    return []
  }
}

export function getTotalCommands(db: Database.Database, projectId: string): number {
  try {
    const row = db.prepare('SELECT COUNT(*) as total FROM cmd_usage WHERE project_id = ?').get(projectId) as
      { total: number } | undefined
    return row?.total ?? 0
  } catch {
    return 0
  }
}
