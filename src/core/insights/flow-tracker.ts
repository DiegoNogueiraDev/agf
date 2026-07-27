/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Flow Tracker — captures daily status snapshots for Cumulative Flow Diagrams.
 * Uses flow_snapshots table (migration v26).
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { generateId } from '../utils/id.js'
import { now } from '../utils/time.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'flow-tracker.ts' })

export interface FlowSnapshot {
  id: string
  projectId: string
  snapshotDate: string
  backlogCount: number
  readyCount: number
  inProgressCount: number
  blockedCount: number
  doneCount: number
  sprint: string | null
  createdAt: string
}

/**
 * Capture a flow snapshot for today.
 * If a snapshot already exists for today (same project + date + sprint), returns the existing one.
 */
export function captureFlowSnapshot(store: SqliteStore, projectId: string, sprint?: string): FlowSnapshot | null {
  const db = store.getDb()
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const sprintValue = sprint ?? null

  try {
    // Check if snapshot already exists for today
    interface FlowRow {
      id: string
      project_id: string
      snapshot_date: string
      backlog_count: number
      ready_count: number
      in_progress_count: number
      blocked_count: number
      done_count: number
      sprint: string | null
      created_at: string
    }

    const existing = db
      .prepare(`SELECT * FROM flow_snapshots WHERE project_id = ? AND snapshot_date = ? AND sprint IS ?`)
      .get(projectId, today, sprintValue) as FlowRow | undefined

    if (existing) {
      return {
        id: existing.id,
        projectId: existing.project_id,
        snapshotDate: existing.snapshot_date,
        backlogCount: existing.backlog_count,
        readyCount: existing.ready_count,
        inProgressCount: existing.in_progress_count,
        blockedCount: existing.blocked_count,
        doneCount: existing.done_count,
        sprint: existing.sprint,
        createdAt: existing.created_at,
      }
    }

    // Count nodes by status
    const sprintFilter = sprint ? `AND sprint = ?` : ''
    const params: unknown[] = [projectId]
    if (sprint) params.push(sprint)

    // AUDIT-015: soft-deleted (archived) nodes must not appear in the CFD counts.
    const countByStatus = (status: string): number => {
      const row = db
        .prepare(
          `SELECT COUNT(*) as cnt FROM nodes WHERE project_id = ? ${sprintFilter} AND status = ? AND (archived = 0 OR archived IS NULL)`,
        )
        .get(...params, status) as { cnt: number }
      return row.cnt
    }

    const snapshot: FlowSnapshot = {
      id: generateId('flow'),
      projectId,
      snapshotDate: today,
      backlogCount: countByStatus('backlog'),
      readyCount: countByStatus('ready'),
      inProgressCount: countByStatus('in_progress'),
      blockedCount: countByStatus('blocked'),
      doneCount: countByStatus('done'),
      sprint: sprintValue,
      createdAt: now(),
    }

    db.prepare(
      `
      INSERT INTO flow_snapshots (id, project_id, snapshot_date, backlog_count, ready_count, in_progress_count, blocked_count, done_count, sprint, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      snapshot.id,
      snapshot.projectId,
      snapshot.snapshotDate,
      snapshot.backlogCount,
      snapshot.readyCount,
      snapshot.inProgressCount,
      snapshot.blockedCount,
      snapshot.doneCount,
      snapshot.sprint,
      snapshot.createdAt,
    )

    log.info('flow-tracker:snapshot_captured', {
      projectId,
      date: today,
      sprint: sprintValue,
      total:
        snapshot.backlogCount +
        snapshot.readyCount +
        snapshot.inProgressCount +
        snapshot.blockedCount +
        snapshot.doneCount,
    })

    return snapshot
  } catch (err) {
    log.warn('flow-tracker:capture_failed', { error: String(err) })
    return null
  }
}

/**
 * Get CFD time-series data for a project.
 */
export function getCfdData(
  store: SqliteStore,
  projectId: string,
  options?: { startDate?: string; endDate?: string; sprint?: string },
): FlowSnapshot[] {
  const db = store.getDb()
  const conditions = ['project_id = ?']
  const params: unknown[] = [projectId]

  if (options?.startDate) {
    conditions.push('snapshot_date >= ?')
    params.push(options.startDate)
  }
  if (options?.endDate) {
    conditions.push('snapshot_date <= ?')
    params.push(options.endDate)
  }
  if (options?.sprint) {
    conditions.push('sprint = ?')
    params.push(options.sprint)
  }

  interface FlowSnapshotRow {
    id: string
    project_id: string
    snapshot_date: string
    backlog_count: number
    ready_count: number
    in_progress_count: number
    blocked_count: number
    done_count: number
    sprint: string | null
    created_at: string
  }

  try {
    const rows = db
      .prepare(`SELECT * FROM flow_snapshots WHERE ${conditions.join(' AND ')} ORDER BY snapshot_date ASC`)
      .all(...params) as FlowSnapshotRow[]

    return rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      snapshotDate: r.snapshot_date,
      backlogCount: r.backlog_count,
      readyCount: r.ready_count,
      inProgressCount: r.in_progress_count,
      blockedCount: r.blocked_count,
      doneCount: r.done_count,
      sprint: r.sprint,
      createdAt: r.created_at,
    }))
  } catch (err) {
    log.warn('flow-tracker:query_failed', { error: String(err) })
    return []
  }
}
