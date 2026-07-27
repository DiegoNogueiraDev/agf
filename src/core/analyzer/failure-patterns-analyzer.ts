/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-self-healing Task 3.1 — analyze(mode:"failure_patterns")
 *
 * Pure deterministic function: reads failure_signals from DB, classifies them
 * via classifySignals(), and returns ordered pattern report (severity + recency).
 */

import type Database from 'better-sqlite3'
import { classifySignals, type ClassifierSignal, type ClassifiedPattern } from '../harness/issue-pattern-tracker.js'

// ── Types ────────────────────────────────────────────────────────────────────

export interface FailurePatternEntry {
  patternType: string
  count: number
  severity: 'critical' | 'error' | 'warn'
  firstSeen: string
  lastSeen: string
  topContexts: Array<Record<string, unknown>>
  openProposals: number
}

export interface FailurePatternsReport {
  windowDays: number
  patterns: FailurePatternEntry[]
  summary: {
    total: number
    signalCount: number
  }
}

// ── Internal ─────────────────────────────────────────────────────────────────

interface DbSignalRow {
  source: string
  signalKind: string
  context: string
  severity: string
  timestamp: string
  rawError: string | null
}

const SEVERITY_ORDER: Record<string, number> = { critical: 3, error: 2, warn: 1 }

const PATTERN_SEVERITY: Record<string, 'critical' | 'error' | 'warn'> = {
  sqlite_lock_storm: 'critical',
  mcp_adapter_flaky: 'critical',
  gate_blocking_too_often: 'error',
  tool_failing_for_input_kind: 'error',
}

function resolveSeverity(patternType: string, signals: DbSignalRow[]): 'critical' | 'error' | 'warn' {
  const base = PATTERN_SEVERITY[patternType]
  if (base) return base
  // dod_check_X_chronic and others: derive from max signal severity
  if (signals.some((s) => s.severity === 'critical')) return 'critical'
  if (signals.some((s) => s.severity === 'error')) return 'error'
  return 'warn'
}

function parseContext(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function findMatchingSignals(pattern: ClassifiedPattern, rows: DbSignalRow[]): DbSignalRow[] {
  const pt = pattern.patternType

  if (pt === 'gate_blocking_too_often') {
    const toolName = pattern.context.toolName as string | undefined
    return rows.filter((r) => {
      if (r.source !== 'lifecycle_gate' || r.signalKind !== 'gate_blocked') return false
      if (!toolName) return true
      return parseContext(r.context).toolName === toolName
    })
  }

  if (pt === 'tool_failing_for_input_kind') {
    const toolName = pattern.context.toolName as string | undefined
    return rows.filter((r) => {
      if (r.source !== 'tool_invocation' || r.signalKind !== 'tool_isError') return false
      if (!toolName) return true
      return parseContext(r.context).toolName === toolName
    })
  }

  if (pt === 'sqlite_lock_storm') {
    return rows.filter(
      (r) => r.source === 'sqlite' && (r.signalKind === 'SQLITE_BUSY' || r.signalKind === 'SQLITE_LOCKED'),
    )
  }

  if (pt === 'mcp_adapter_flaky') {
    const adapterName = pattern.context.adapterName as string | undefined
    return rows.filter((r) => {
      if (r.source !== 'mcp_server' || r.signalKind !== 'uncaught_exception') return false
      if (!adapterName) return true
      return parseContext(r.context).adapterName === adapterName
    })
  }

  if (pt.startsWith('dod_check_') && pt.endsWith('_chronic')) {
    const checkName = pt.slice('dod_check_'.length, -'_chronic'.length)
    return rows.filter(
      (r) =>
        r.source === 'dod_check' &&
        r.signalKind === 'dod_fail' &&
        r.rawError != null &&
        r.rawError.split(',').some((c) => c.trim() === checkName),
    )
  }

  return rows
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyze failure_signals within the given window and return classified patterns.
 *
 * openProposalsByPattern — optional map of patternType → count of open
 * HealingProposals. When omitted, openProposals defaults to 0 (satisfies
 * in-memory test scenarios where memory files don't exist).
 */
export function analyzeFailurePatterns(
  db: Database.Database,
  windowDays: number,
  openProposalsByPattern: Map<string, number> = new Map(),
): FailurePatternsReport {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60_000).toISOString()

  let rows: DbSignalRow[]
  try {
    rows = db
      .prepare(
        `SELECT source, signalKind, context, severity, timestamp, rawError
         FROM failure_signals
         WHERE timestamp >= ?
         ORDER BY timestamp ASC`,
      )
      .all(cutoff) as DbSignalRow[]
  } catch {
    // Table may not exist in older DBs — return empty report rather than crash.
    return { windowDays, patterns: [], summary: { total: 0, signalCount: 0 } }
  }

  if (rows.length === 0) {
    return { windowDays, patterns: [], summary: { total: 0, signalCount: 0 } }
  }

  const signals: ClassifierSignal[] = rows.map((row) => ({
    source: row.source,
    signalKind: row.signalKind,
    context: parseContext(row.context) as ClassifierSignal['context'],
    timestamp: row.timestamp,
    rawError: row.rawError ?? undefined,
  }))

  const classified = classifySignals(signals)
  if (classified.length === 0) {
    return { windowDays, patterns: [], summary: { total: 0, signalCount: rows.length } }
  }

  const entries: FailurePatternEntry[] = classified.map((pattern) => {
    const matching = findMatchingSignals(pattern, rows)
    const sorted = [...matching].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    const top5Contexts = sorted.slice(-5).map((r) => parseContext(r.context))

    return {
      patternType: pattern.patternType,
      count: matching.length,
      severity: resolveSeverity(pattern.patternType, matching),
      firstSeen: sorted[0]?.timestamp ?? new Date().toISOString(),
      lastSeen: sorted[sorted.length - 1]?.timestamp ?? new Date().toISOString(),
      topContexts: top5Contexts,
      openProposals: openProposalsByPattern.get(pattern.patternType) ?? 0,
    }
  })

  // Order: severity desc → lastSeen desc (most recent first within same severity)
  entries.sort((a, b) => {
    const sevDiff = (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0)
    if (sevDiff !== 0) return sevDiff
    return b.lastSeen.localeCompare(a.lastSeen)
  })

  return {
    windowDays,
    patterns: entries,
    summary: { total: entries.length, signalCount: rows.length },
  }
}
