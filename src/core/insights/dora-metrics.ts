/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * DORA Metrics Calculator — 4 key indicators of delivery health.
 * Based on the DORA (DevOps Research and Assessment) framework.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { McpGraphError } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'dora-metrics.ts' })

export interface DoraMetrics {
  deploymentFrequency: number // tasks done per day (rolling 7d)
  leadTime: {
    p50: number // median hours created→done
    p85: number
    p95: number
  }
  changeFailureRate: number // 0-1 ratio of tasks with status reversals
  mttr: number // hours: rework detection → resolution
  trend: 'improving' | 'stable' | 'declining'
  trendAlert: TrendAlert
}

export interface TrendAlert {
  active: boolean
  message: string
  decliningSprints: number
}

/**
 * Calculate DORA metrics from graph node data.
 */
export function calculateDoraMetrics(store: SqliteStore): DoraMetrics {
  if (!store) {
    throw new McpGraphError('DORA metrics require a valid SqliteStore')
  }
  const db = store.getDb()
  const project = store.getProject()
  if (!project) {
    return emptyMetrics()
  }

  try {
    // 1. Deployment Frequency — tasks done per day (rolling 7d)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    // AUDIT-015: exclude soft-deleted (archived) nodes — counting them inflates DORA.
    const doneRecent = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM nodes WHERE project_id = ? AND status = 'done' AND updated_at >= ? AND (archived = 0 OR archived IS NULL)`,
      )
      .get(project.id, sevenDaysAgo) as { cnt: number }
    const deploymentFrequency = doneRecent.cnt / 7

    // 2. Lead Time — created_at → updated_at (when done) in hours
    const doneNodes = db
      .prepare(
        `SELECT created_at, updated_at FROM nodes WHERE project_id = ? AND status = 'done' AND (archived = 0 OR archived IS NULL) ORDER BY updated_at DESC LIMIT 100`,
      )
      .all(project.id) as { created_at: string; updated_at: string }[]

    const leadTimes = doneNodes
      .map((n) => {
        const created = new Date(n.created_at).getTime()
        const done = new Date(n.updated_at).getTime()
        if (!Number.isFinite(created) || !Number.isFinite(done)) return null
        return Math.max(0, (done - created) / (1000 * 60 * 60)) // hours
      })
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b)

    const leadTime = {
      p50: percentile(leadTimes, 0.5),
      p85: percentile(leadTimes, 0.85),
      p95: percentile(leadTimes, 0.95),
    }

    // 3. Change Failure Rate — tasks that were done then reverted
    // A task that went done→in_progress is considered a "failure"
    const totalDone = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM nodes WHERE project_id = ? AND (status = 'done' OR status = 'in_progress') AND (archived = 0 OR archived IS NULL)`,
      )
      .get(project.id) as { cnt: number }

    // Detect reversals: tasks currently in_progress that have been done before
    // We use node_changelog if available, otherwise approximate from status
    let reverseCount = 0
    try {
      const reversals = db
        .prepare(
          `SELECT COUNT(DISTINCT node_id) as cnt FROM node_changelog
         WHERE project_id = ? AND field = 'status' AND old_value = 'done' AND new_value = 'in_progress'`,
        )
        .get(project.id) as { cnt: number }
      reverseCount = reversals.cnt
    } catch {
      // node_changelog may not exist in older DBs
      reverseCount = 0
    }

    const changeFailureRate = totalDone.cnt > 0 ? reverseCount / totalDone.cnt : 0

    // 4. MTTR — time from rework (done→in_progress) to resolution (→done again)
    let mttr = 0
    try {
      const reworkTimes = db
        .prepare(
          `SELECT c1.changed_at as rework_start, c2.changed_at as rework_end
         FROM node_changelog c1
         JOIN node_changelog c2 ON c1.node_id = c2.node_id AND c2.changed_at > c1.changed_at
         WHERE c1.project_id = ? AND c1.field = 'status' AND c1.old_value = 'done' AND c1.new_value = 'in_progress'
           AND c2.field = 'status' AND c2.new_value = 'done'
         ORDER BY c1.changed_at DESC LIMIT 20`,
        )
        .all(project.id) as { rework_start: string; rework_end: string }[]

      if (reworkTimes.length > 0) {
        const times = reworkTimes.map((r) => {
          const start = new Date(r.rework_start).getTime()
          const end = new Date(r.rework_end).getTime()
          return Math.max(0, (end - start) / (1000 * 60 * 60))
        })
        mttr = percentile(times, 0.5)
      }
    } catch {
      // node_changelog may not exist
      mttr = 0
    }

    // 5. Trend + TrendAlert — compare 3 consecutive 7d windows
    const twentyOneDaysAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

    const doneOlder = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM nodes WHERE project_id = ? AND status = 'done' AND updated_at >= ? AND updated_at < ? AND (archived = 0 OR archived IS NULL)`,
      )
      .get(project.id, twentyOneDaysAgo, fourteenDaysAgo) as { cnt: number }

    const donePrev = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM nodes WHERE project_id = ? AND status = 'done' AND updated_at >= ? AND updated_at < ? AND (archived = 0 OR archived IS NULL)`,
      )
      .get(project.id, fourteenDaysAgo, sevenDaysAgo) as { cnt: number }

    function determineTrend(current: number, previous: number): 'improving' | 'stable' | 'declining' {
      if (current === 0 && previous === 0) return 'stable'
      if (current > previous * 1.2) return 'improving'
      if (current < previous * 0.8) return 'declining'
      return 'stable'
    }

    const trend = determineTrend(doneRecent.cnt, donePrev.cnt)
    const olderTrend = determineTrend(donePrev.cnt, doneOlder.cnt)

    let trendAlert: { active: boolean; message: string; decliningSprints: number }
    if (trend === 'declining' && olderTrend === 'declining') {
      trendAlert = {
        active: true,
        message: 'DORA_ALERT: trend has been declining for 2+ consecutive sprints. Check bottlenecks and WIP.',
        decliningSprints: 2,
      }
    } else if (trend === 'declining') {
      trendAlert = {
        active: true,
        message: 'DORA_WARNING: trend is declining this sprint. Monitor closely.',
        decliningSprints: 1,
      }
    } else {
      trendAlert = { active: false, message: 'DORA_OK: trend is stable or improving', decliningSprints: 0 }
    }

    log.info('dora-metrics:calculated', {
      deploymentFrequency,
      leadTimeP50: leadTime.p50,
      changeFailureRate,
      mttr,
      trend,
      trendAlertActive: trendAlert.active,
      decliningSprints: trendAlert.decliningSprints,
    })

    return { deploymentFrequency, leadTime, changeFailureRate, mttr, trend, trendAlert }
  } catch (err) {
    log.warn('dora-metrics:calculation_failed', { error: String(err) })
    return emptyMetrics()
  }
}

/**
 * Nearest-rank percentile calculation.
 * @internal Exported for testing.
 */
export function percentile(sortedValues: number[], p: number): number {
  const values = sortedValues.filter(Number.isFinite).sort((a, b) => a - b)
  if (values.length === 0) return 0
  const clampedP = Math.min(1, Math.max(0, p))
  const idx = Math.ceil(clampedP * values.length) - 1
  return values[Math.max(0, Math.min(idx, values.length - 1))]
}

function emptyMetrics(): DoraMetrics {
  return {
    deploymentFrequency: 0,
    leadTime: { p50: 0, p85: 0, p95: 0 },
    changeFailureRate: 0,
    mttr: 0,
    trend: 'stable',
    trendAlert: { active: false, message: 'DORA_OK: no data', decliningSprints: 0 },
  }
}
