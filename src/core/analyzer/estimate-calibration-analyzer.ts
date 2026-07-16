/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Estimate calibration analyzer — Task 2.3 (autonomy-gap-3-to-6 PRD).
 *
 * Queries all done nodes that have `estimateDelta` persisted in metadata,
 * groups by xpSize, and computes calibration statistics: avg_delta, bias_pct,
 * and confidence level (low <5, medium 5-10, high >10 samples).
 *
 * All computation is 100% deterministic. No LLM calls. §ADR-deterministic-first
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'estimate-calibration-analyzer.ts' })

export type CalibrationConfidence = 'low' | 'medium' | 'high'

export interface SizeCalibrationEntry {
  avg_delta: number
  bias_pct: number
  confidence: CalibrationConfidence
  count: number
  /** The average estimate in hours for this size (used to compute bias_pct) */
  estimateHours: number
}

export type XpSize = 'XS' | 'S' | 'M' | 'L' | 'XL'

export type SizeCalibrationReport = Partial<Record<XpSize, SizeCalibrationEntry>>

/**
 * Compute estimateDelta for a completed task.
 * Returns null when estimate or actual time is unavailable (prevents spurious data).
 *
 * @param completionHours  Actual hours from in_progress to done (cycleTimeMs / 3600000)
 * @param estimateMinutes  Original estimate in minutes (from node.estimateMinutes)
 */
export function computeEstimateDelta(completionHours: number, estimateMinutes: number | undefined): number | null {
  if (!estimateMinutes || estimateMinutes <= 0) return null
  if (!completionHours || completionHours <= 0) return null
  const estimateHours = estimateMinutes / 60
  return completionHours - estimateHours
}

/**
 * Aggregate size calibration across all done tasks that have `estimateDelta` in metadata.
 * Groups by xpSize and returns statistics for each size with at least 1 data point.
 */
export function computeSizeCalibration(store: SqliteStore): SizeCalibrationReport {
  const report: SizeCalibrationReport = {}

  try {
    // Collect done tasks in batches (limit 500 per query)
    const allDone: Array<{ xpSize: string; estimateDelta: number; estimateMinutes: number }> = []
    let offset = 0
    while (true) {
      const { nodes, totalCount } = store.queryNodes({ status: ['done'], limit: 500, offset })
      for (const node of nodes) {
        const meta = node.metadata as Record<string, unknown> | undefined
        const delta = meta?.estimateDelta
        if (typeof delta === 'number' && node.xpSize && node.estimateMinutes) {
          allDone.push({
            xpSize: node.xpSize,
            estimateDelta: delta,
            estimateMinutes: node.estimateMinutes,
          })
        }
      }
      offset += nodes.length
      if (offset >= totalCount) break
    }

    // Group by xpSize
    const groups = new Map<string, { deltas: number[]; estimateHours: number[] }>()
    for (const entry of allDone) {
      if (!groups.has(entry.xpSize)) {
        groups.set(entry.xpSize, { deltas: [], estimateHours: [] })
      }
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §pre-existing: groups.has() guard ensures key exists on line above
      const g = groups.get(entry.xpSize)!
      g.deltas.push(entry.estimateDelta)
      g.estimateHours.push(entry.estimateMinutes / 60)
    }

    for (const [size, { deltas, estimateHours }] of groups.entries()) {
      const count = deltas.length
      const avg_delta = deltas.reduce((s, d) => s + d, 0) / count
      const avg_estimate = estimateHours.reduce((s, h) => s + h, 0) / count
      const bias_pct = avg_estimate > 0 ? (avg_delta / avg_estimate) * 100 : 0
      const confidence: CalibrationConfidence = count >= 10 ? 'high' : count >= 5 ? 'medium' : 'low'

      report[size as XpSize] = {
        avg_delta: Math.round(avg_delta * 1000) / 1000,
        bias_pct: Math.round(bias_pct * 10) / 10,
        confidence,
        count,
        estimateHours: Math.round(avg_estimate * 100) / 100,
      }
    }

    log.info('estimate-calibration:computed', {
      sizes: Object.keys(report).join(','),
    })
  } catch (err) {
    log.warn('estimate-calibration:failed', { error: String(err) })
  }

  return report
}

/**
 * Format a calibration report as a human-readable summary for analyze() output.
 */
export function formatCalibrationReport(report: SizeCalibrationReport): string {
  const sizes: XpSize[] = ['XS', 'S', 'M', 'L', 'XL']
  const lines: string[] = []
  for (const size of sizes) {
    const entry = report[size]
    if (!entry) continue
    const sign = entry.avg_delta >= 0 ? '+' : ''
    lines.push(
      `${size}: avg_delta=${sign}${entry.avg_delta}h, bias=${sign}${entry.bias_pct}%, ` +
        `confidence=${entry.confidence}, n=${entry.count}`,
    )
  }
  return lines.length > 0 ? lines.join('\n') : 'No calibration data yet.'
}
