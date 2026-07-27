/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Harness Trends — SQL-based trend analysis over harness_history
 *
 * Calculates direction (improving/declining/stable), slope via linear regression,
 * and grade target prediction via extrapolation.
 * ADR-V4-05: SQL over harness_history, no time-series DB.
 */

import type Database from 'better-sqlite3'

export interface TrendResult {
  direction: 'improving' | 'declining' | 'stable' | 'unknown'
  slope: number
  min: number
  max: number
  avg: number
  stddev: number
  dataPoints: number
}

export interface GradePrediction {
  targetGrade: string
  targetScore: number
  currentScore: number
  slope: number
  scansNeeded: number
}

const GRADE_THRESHOLDS: Record<string, number> = {
  A: 85,
  B: 70,
  C: 55,
  D: 0,
}

/** A persisted harness_history row carrying its per-dimension breakdown JSON. */
export interface HarnessBreakdownRow {
  breakdown: string
  timestamp: string
  score: number
}

/**
 * Read the most recent `n` harness_history rows (newest first) with their
 * breakdown JSON. Enables zero-scan saturation detection (colony-health) by
 * comparing the latest persisted breakdown against the previous one.
 */
export function readRecentHarnessBreakdowns(
  db: Database.Database,
  projectId: string = 'proj_local',
  n: number = 2,
): HarnessBreakdownRow[] {
  return db
    .prepare(
      'SELECT score, breakdown, timestamp FROM harness_history WHERE project_id = ? ORDER BY timestamp DESC LIMIT ?',
    )
    .all(projectId, n) as HarnessBreakdownRow[]
}

/**
 * Calculate trend statistics from harness_history (last 30 records).
 * Uses linear regression (least squares) for slope.
 */
export function getTrends(db: Database.Database, projectId: string = 'proj_local'): TrendResult {
  const rows = db
    .prepare('SELECT score FROM harness_history WHERE project_id = ? ORDER BY timestamp ASC LIMIT 30')
    .all(projectId) as Array<{ score: number }>

  if (rows.length === 0) {
    return { direction: 'unknown', slope: 0, min: 0, max: 0, avg: 0, stddev: 0, dataPoints: 0 }
  }

  const scores = rows.map((r) => r.score)
  const nVar = scores.length
  const min = Math.min(...scores)
  const max = Math.max(...scores)
  const avg = Math.round((scores.reduce((a, b) => a + b, 0) / nVar) * 10) / 10

  // Standard deviation
  const variance = scores.reduce((sum, s) => sum + (s - avg) ** 2, 0) / nVar
  const stddev = Math.round(Math.sqrt(variance) * 10) / 10

  // Linear regression slope (least squares)
  // x = index (0, 1, 2, ...), y = score
  const xMean = (nVar - 1) / 2
  const yMean = scores.reduce((a, b) => a + b, 0) / nVar
  let numerator = 0
  let denominator = 0
  for (let i = 0; i < nVar; i++) {
    numerator += (i - xMean) * (scores[i] - yMean)
    denominator += (i - xMean) ** 2
  }
  const slope = denominator === 0 ? 0 : Math.round((numerator / denominator) * 100) / 100

  let direction: TrendResult['direction']
  if (slope > 0.5) direction = 'improving'
  else if (slope < -0.5) direction = 'declining'
  else direction = 'stable'

  return { direction, slope, min, max, avg, stddev, dataPoints: nVar }
}

/**
 * Predict how many scans needed to reach a target grade.
 * Returns null if already at target, slope is negative, or insufficient data.
 */
export function predictGradeTarget(
  db: Database.Database,
  targetGrade: string,
  projectId: string = 'proj_local',
): GradePrediction | null {
  const targetScore = GRADE_THRESHOLDS[targetGrade]
  if (targetScore === undefined) return null

  const trends = getTrends(db, projectId)
  if (trends.dataPoints < 3) return null

  // Get current score (most recent)
  const latest = db
    .prepare('SELECT score FROM harness_history WHERE project_id = ? ORDER BY timestamp DESC LIMIT 1')
    .get(projectId) as { score: number } | undefined

  if (!latest) return null

  const currentScore = latest.score

  // Already at or above target
  if (currentScore >= targetScore) return null

  // Slope must be positive to predict improvement
  if (trends.slope <= 0) return null

  const gap = targetScore - currentScore
  const scansNeeded = Math.ceil(gap / trends.slope)

  return {
    targetGrade,
    targetScore,
    currentScore,
    slope: trends.slope,
    scansNeeded,
  }
}
