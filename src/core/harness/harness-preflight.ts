/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Harness Preflight Warning — advisory quality signal for start_task.
 *
 * Reads the most recent harness_history snapshot and returns a warning
 * if the project's harnessability score is below grade B (< 70).
 * Non-blocking: returns null on any error or missing data.
 */

import type Database from 'better-sqlite3'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'harness-preflight.ts' })

export interface HarnessPreflightWarning {
  score: number
  grade: string
  message: string
}

/**
 * Get a pre-flight harness warning based on the most recent scan result.
 * Returns null if score >= 70 (grade A/B), no history, or any error.
 */
export function getHarnessPreflightWarning(db: Database.Database): HarnessPreflightWarning | null {
  try {
    const row = db.prepare('SELECT score, grade FROM harness_history ORDER BY timestamp DESC LIMIT 1').get() as
      { score: number; grade: string } | undefined

    if (!row) return null

    if (row.score >= 70) return null

    const message =
      row.score < 55
        ? `High hallucination risk — grade ${row.grade} (score ${row.score}). Extra caution recommended.`
        : `Moderate quality gap — grade ${row.grade} (score ${row.score}). Exercise caution with inferences.`

    return {
      score: row.score,
      grade: row.grade,
      message,
    }
  } catch (err) {
    log.warn('harness:preflight:error', { error: String(err) })
    return null
  }
}

export interface HarnessRegressionReport {
  before: number
  after: number
  delta: number
}

export interface HarnessGateResult {
  /** Whether finish_task should be blocked by this gate. */
  blocked: boolean
  mode: 'strict' | 'advisory' | 'off'
  startScore: number
  endScore: number
  /** Signed delta (negative = regression). Rounded to 1 decimal. */
  delta: number
  /** Reason provided to override the block in strict mode. */
  overrideReason?: string
}

/**
 * Deterministic gate: blocks finish_task (strict) or warns (advisory) when
 * harness score dropped more than `threshold` points since start_task.
 *
 * Returns {blocked: false} when drop ≤ threshold, mode is "off", or an
 * override reason is supplied (override is always recorded in the result).
 */
export function checkHarnessRegressionGate(
  startScore: number,
  endScore: number,
  mode: 'strict' | 'advisory' | 'off',
  threshold: number = 5,
  overrideReason?: string,
): HarnessGateResult {
  const delta = Math.round((endScore - startScore) * 10) / 10
  const base: HarnessGateResult = { blocked: false, mode, startScore, endScore, delta }

  if (mode === 'off') return base
  // Only block when drop strictly exceeds threshold (drop > threshold, not ≥)
  if (delta >= -threshold) return base

  // Drop exceeds threshold
  if (overrideReason) {
    return { ...base, overrideReason }
  }

  if (mode === 'strict') {
    return { ...base, blocked: true }
  }

  // advisory: not blocked, delta surfaced for caller to emit warning
  return base
}

/**
 * Compare current harness score with the previous snapshot.
 * Returns regression report if score dropped > 5 points, null otherwise.
 */
export function getHarnessRegressionReport(
  db: Database.Database,
  currentScore: number,
): HarnessRegressionReport | null {
  try {
    const rows = db.prepare('SELECT score FROM harness_history ORDER BY timestamp DESC LIMIT 2').all() as Array<{
      score: number
    }>

    if (rows.length < 2) return null

    // rows[0] is the most recent (just inserted), rows[1] is previous
    const previousScore = rows[1].score
    const delta = Math.round((currentScore - previousScore) * 10) / 10

    if (delta >= -5) return null

    return {
      before: previousScore,
      after: currentScore,
      delta,
    }
  } catch (err) {
    log.warn('harness:regression:error', { error: String(err) })
    return null
  }
}
