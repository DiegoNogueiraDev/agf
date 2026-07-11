/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Danger Signal Detector — Matzinger's Danger Model.
 *
 * Scans TypeScript source content for known danger patterns: raw throws,
 * swallowed catches, console.error/warn usage, and repeated failures.
 * Each signal carries a severity and confidence score.
 *
 * Expanded with runtime signal sources (Phase 3): consumes failures from
 * llm_call_ledger (error_rate_spike), error-handling-scanner.ts output,
 * and graph operation failures.
 *
 * Bio foundation: Danger Model (Matzinger 1994, 2002). Danger signals come
 * from stressed/dying cells, not just from pathogen patterns. Runtime
 * errors are the "stressed cells" of software — they indicate actual
 * failures, not just potential ones.
 */

import type Database from 'better-sqlite3'
import type { DangerSignal, DangerSignalKind, Severity } from './immune-types.js'
import type { ViolationDetail } from '../harness/violation-detail.js'

const TYPED_ERRORS_IMPORT = /from\s+["'][^"']*utils\/errors(?:\.js)?["']/
const RAW_THROW_PATTERN = /\bthrow\s+new\s+Error\s*\(/g
const EMPTY_CATCH_PATTERN = /\bcatch\s*\([^)]*\)\s*\{\s*\}/g
const CONSOLE_ERROR_PATTERN = /\bconsole\.(error|warn)\s*\(/g

interface SourceFile {
  path: string
  content: string
}

let signalCounter = 0

function nextSignalId(): string {
  signalCounter++
  return `ds_${Date.now()}_${signalCounter}`
}

function inferSeverity(kind: DangerSignalKind): Severity {
  switch (kind) {
    case 'raw_throw':
      return 'high'
    case 'swallowed_catch':
      return 'critical'
    case 'console_error':
      return 'medium'
    case 'untyped_error':
      return 'medium'
    case 'repeated_failure':
      return 'high'
    case 'regression_hotspot':
      return 'critical'
    case 'error_rate_spike':
      return 'critical'
    case 'graph_operation_failure':
      return 'high'
  }
}

function isTestFile(path: string): boolean {
  return path.endsWith('.test.ts') || path.endsWith('.bench.ts') || path.endsWith('.spec.ts')
}

export function detectDangerSignals(files: SourceFile[]): DangerSignal[] {
  const signals: DangerSignal[] = []

  for (const file of files) {
    if (isTestFile(file.path)) continue

    const hasTypedImport = TYPED_ERRORS_IMPORT.test(file.content)
    const now = Date.now()

    if (!hasTypedImport) {
      let match: RegExpExecArray | null
      const re = new RegExp(RAW_THROW_PATTERN.source, 'g')
      while ((match = re.exec(file.content)) !== null) {
        const line = file.content.slice(0, match.index).split('\n').length
        signals.push({
          id: nextSignalId(),
          kind: 'raw_throw',
          file: file.path,
          line,
          evidence: match[0],
          severity: inferSeverity('raw_throw'),
          confidence: 1.0,
          detectedAt: now,
        })
      }
    }

    {
      let match: RegExpExecArray | null
      const re = new RegExp(EMPTY_CATCH_PATTERN.source, 'g')
      while ((match = re.exec(file.content)) !== null) {
        const line = file.content.slice(0, match.index).split('\n').length
        signals.push({
          id: nextSignalId(),
          kind: 'swallowed_catch',
          file: file.path,
          line,
          evidence: match[0],
          severity: inferSeverity('swallowed_catch'),
          confidence: 1.0,
          detectedAt: now,
        })
      }
    }

    {
      let match: RegExpExecArray | null
      const re = new RegExp(CONSOLE_ERROR_PATTERN.source, 'g')
      while ((match = re.exec(file.content)) !== null) {
        const line = file.content.slice(0, match.index).split('\n').length
        signals.push({
          id: nextSignalId(),
          kind: 'console_error',
          file: file.path,
          line,
          evidence: match[0],
          severity: inferSeverity('console_error'),
          confidence: 0.9,
          detectedAt: now,
        })
      }
    }
  }

  return signals
}

/**
 * Detect runtime danger signals from llm_call_ledger.
 * Queries error rate in a rolling window (last N calls).
 */
export function detectRuntimeSignals(db: Database.Database, projectId: string, _windowSize = 100): DangerSignal[] {
  const signals: DangerSignal[] = []
  const now = Date.now()

  try {
    const recent = db
      .prepare(
        `
      SELECT COUNT(*) as total,
             SUM(CASE WHEN status = 'error' OR (error_kind IS NOT NULL AND error_kind != '') THEN 1 ELSE 0 END) as errors
      FROM (
        SELECT status, error_kind FROM llm_call_ledger
        WHERE project_id = ?
        ORDER BY ts DESC
        LIMIT ?
      )
    `,
      )
      .get(projectId, _windowSize) as { total: number; errors: number } | undefined

    if (recent && recent.total >= 10) {
      const errorRate = recent.errors / recent.total
      if (errorRate > 0.15) {
        signals.push({
          id: nextSignalId(),
          kind: 'error_rate_spike',
          file: 'llm_call_ledger',
          line: 0,
          evidence: `error_rate=${(errorRate * 100).toFixed(1)}% (${recent.errors}/${recent.total} calls)`,
          severity: inferSeverity('error_rate_spike'),
          confidence: Math.min(1.0, errorRate * 3),
          detectedAt: now,
        })
      }
    }
  } catch {
    /* table may not exist */
  }

  return signals
}

/**
 * Merge static source signals with runtime signals.
 */
export function mergeDangerSignals(staticSignals: DangerSignal[], runtimeSignals: DangerSignal[]): DangerSignal[] {
  return [...staticSignals, ...runtimeSignals]
}

export function computeDangerScore(signals: DangerSignal[]): number {
  if (signals.length === 0) return 0
  const weight: Record<Severity, number> = { low: 1, medium: 3, high: 8, critical: 20 }
  const raw = signals.reduce((acc, s) => acc + (weight[s.severity] ?? 1) * s.confidence, 0)
  return Math.min(100, raw)
}

/** Maps a scanner violationType string to the matching DangerSignalKind. */
function violationTypeToKind(violationType: string): DangerSignalKind {
  switch (violationType) {
    case 'raw_throw':
      return 'raw_throw'
    case 'swallowed_catch':
      return 'swallowed_catch'
    case 'console_error':
    case 'console_warn':
      return 'console_error'
    default:
      return 'untyped_error'
  }
}

/**
 * AC2: Convert error-handling-scanner ViolationDetail[] to DangerSignal[].
 *
 * The scanner produces structured violation records with file, line, evidence,
 * and confidence. This adapter converts each violation into a DangerSignal so
 * it can be merged with runtime signals via mergeDangerSignals.
 */
export function dangerSignalsFromScannerViolations(violations: ViolationDetail[]): DangerSignal[] {
  const now = Date.now()
  return violations.map((v) => {
    const kind = violationTypeToKind(v.violationType)
    return {
      id: nextSignalId(),
      kind,
      file: v.file,
      line: v.line,
      evidence: v.evidence,
      severity: inferSeverity(kind),
      confidence: v.confidence,
      detectedAt: now,
    }
  })
}

/**
 * AC3: Detect graph_operation_failure signals from recent failed healing_log entries.
 *
 * Queries healing_log for entries where applied=1 AND success=0 within the last
 * windowMs milliseconds (default: 7 days). Each failure becomes a danger signal
 * for the node that experienced the graph mutation failure.
 */
export function detectGraphOperationFailures(
  db: Database.Database,
  projectId: string,
  windowMs = 7 * 24 * 60 * 60 * 1000,
): DangerSignal[] {
  const signals: DangerSignal[] = []
  const now = Date.now()
  const since = now - windowMs

  try {
    const rows = db
      .prepare(
        `SELECT node_id, action_type, message, ts FROM healing_log
         WHERE project_id = ? AND applied = 1 AND success = 0 AND ts >= ?
         ORDER BY ts DESC LIMIT 50`,
      )
      .all(projectId, since) as {
      node_id: string | null
      action_type: string
      message: string
      ts: number
    }[]

    for (const row of rows) {
      signals.push({
        id: nextSignalId(),
        kind: 'graph_operation_failure',
        file: row.node_id ?? 'unknown_node',
        line: 0,
        evidence: `node_id=${row.node_id ?? 'null'} action=${row.action_type}${row.message ? `: ${row.message}` : ''}`,
        severity: inferSeverity('graph_operation_failure'),
        confidence: 0.95,
        detectedAt: now,
      })
    }
  } catch {
    /* healing_log may not have records or table may be unavailable */
  }

  return signals
}
