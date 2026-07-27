/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * B3 — Quality snapshot system: save weekly quality scores as project settings,
 * detect regression trends (alerta se delta >= 5pts), and surface findings.
 * Uses existing project_settings table — no new migration needed.
 */
import type { SqliteStore } from '../store/sqlite-store.js'
import { runHarnessScanCached } from '../harness/harness-cache.js'
import { evaluateProjectQuality } from '../harness/project-quality.js'
import { collectSrcFiles } from '../harness/collect-src.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'quality-snapshot.ts' })

export interface QualitySnapshot {
  /** ISO timestamp of snapshot */
  ts: string
  /** Harnessability score (0-100) */
  harnessScore: number
  /** Harness grade (A/B/C/D) */
  harnessGrade: string
  /** Test coverage % (0-100) */
  testScore: number
  /** Log coverage % (0-100) */
  logScore: number
  /** Total modules scanned */
  totalModules: number
}

export interface QualityTrend {
  /** Current snapshot */
  current: QualitySnapshot
  /** Previous snapshot (or null if first) */
  previous: QualitySnapshot | null
  /** Harness score delta vs previous */
  harnessDelta: number | null
  /** Test score delta vs previous */
  testDelta: number | null
  /** Log score delta vs previous */
  logDelta: number | null
  /** Severity: 'stable', 'improving', 'warning', 'alert' */
  severity: 'stable' | 'improving' | 'warning' | 'alert'
  /** Human-readable alerts */
  alerts: string[]
}

const SNAPSHOT_KEY = 'quality_latest_snapshot'
const HISTORY_PREFIX = 'quality_snapshot_'

/**
 * Collect a quality snapshot from the current project state.
 * Non-blocking — returns null on any scan error.
 */
export function collectQualitySnapshot(dir: string, store: SqliteStore): QualitySnapshot | null {
  try {
    const harness = runHarnessScanCached(dir, store.getDb())
    if (!harness) return null

    const files = collectSrcFiles(dir)
    const quality = evaluateProjectQuality(files)

    return {
      ts: new Date().toISOString(),
      harnessScore: harness.score,
      harnessGrade: harness.grade,
      testScore: quality.testScore,
      logScore: quality.logScore,
      totalModules: quality.totalModules,
    }
  } catch (err) {
    log.warn('quality-snapshot:collect-failed', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

/**
 * Save current snapshot and persist history. Compares with previous
 * snapshot to detect regression trends.
 */
export function saveQualitySnapshot(dir: string, store: SqliteStore): QualityTrend | null {
  const current = collectQualitySnapshot(dir, store)
  if (!current) return null

  // Load previous snapshot
  let previous: QualitySnapshot | null = null
  const prevRaw = store.getProjectSetting(SNAPSHOT_KEY)
  if (prevRaw) {
    try {
      previous = JSON.parse(prevRaw) as QualitySnapshot
    } catch {
      previous = null
    }
  }

  // Save current as latest
  store.setProjectSetting(SNAPSHOT_KEY, JSON.stringify(current))

  // Save history entry (weekly key)
  const weekKey = `${HISTORY_PREFIX}${current.ts.slice(0, 10)}`
  store.setProjectSetting(weekKey, JSON.stringify(current))

  // Trend detection
  const harnessDelta = previous ? current.harnessScore - previous.harnessScore : null
  const testDelta = previous ? current.testScore - previous.testScore : null
  const logDelta = previous ? current.logScore - previous.logScore : null

  const alerts: string[] = []
  let severity: QualityTrend['severity'] = 'stable'

  if (harnessDelta !== null) {
    if (harnessDelta <= -10) {
      severity = 'alert'
      alerts.push(`Harness regrediu ${Math.abs(harnessDelta).toFixed(1)} pontos (>= 10) — investigar urgente`)
    } else if (harnessDelta <= -5) {
      severity = 'warning'
      alerts.push(`Harness regrediu ${Math.abs(harnessDelta).toFixed(1)} pontos (>= 5)`)
    } else if (harnessDelta > 0) {
      severity = 'improving'
    }
  }

  if (testDelta !== null && testDelta <= -5) {
    alerts.push(`Test coverage caiu ${Math.abs(testDelta)}%`)
    if (severity === 'stable') severity = 'warning'
  }

  if (logDelta !== null && logDelta <= -5) {
    alerts.push(`Log coverage caiu ${Math.abs(logDelta)}%`)
    if (severity === 'stable') severity = 'warning'
  }

  if (alerts.length > 0) {
    log.warn('quality-snapshot:trend', { severity, alerts })
  }

  return {
    current,
    previous,
    harnessDelta,
    testDelta,
    logDelta,
    severity,
    alerts,
  }
}

/**
 * Format a quality trend as a human-readable report.
 */
export function formatQualityTrend(trend: QualityTrend): string {
  const lines: string[] = ['═ Quality Snapshot ═']
  const c = trend.current

  lines.push(`Score: ${c.harnessScore}/100 (${c.harnessGrade}) · Tests: ${c.testScore}% · Logs: ${c.logScore}%`)
  lines.push(`Módulos: ${c.totalModules} · Timestamp: ${c.ts}`)

  if (trend.previous) {
    const p = trend.previous
    const hDelta =
      trend.harnessDelta !== null ? (trend.harnessDelta >= 0 ? '+' : '') + trend.harnessDelta.toFixed(1) : '?'
    const tDelta = trend.testDelta !== null ? (trend.testDelta >= 0 ? '+' : '') + trend.testDelta + '%' : '?'
    const lDelta = trend.logDelta !== null ? (trend.logDelta >= 0 ? '+' : '') + trend.logDelta + '%' : '?'

    lines.push(`Anterior (${p.ts.slice(0, 10)}): ${p.harnessScore}/${p.testScore}%/${p.logScore}%`)
    lines.push(`Delta: harness ${hDelta} · tests ${tDelta} · logs ${lDelta}`)
    lines.push(`Tendência: ${trend.severity}`)
  } else {
    lines.push('Primeiro snapshot — baseline estabelecida.')
  }

  for (const alert of trend.alerts) {
    lines.push(`⚠ ${alert}`)
  }

  if (trend.alerts.length === 0 && trend.previous) {
    lines.push('✓ Sem regressões detectadas.')
  }

  return lines.join('\n')
}
