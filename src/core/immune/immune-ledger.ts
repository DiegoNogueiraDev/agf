/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Immune Ledger — records every immune cycle for observability and trend tracking.
 *
 * Mirrors the economy_lever_ledger pattern: an append-only SQLite table that
 * tracks signals detected, antigens presented, responses generated, recovery
 * rate, and duration per cycle. The `agf immune --ledger` command queries it.
 *
 * Phase 5 expansion: tracks gated responses, verification failures, and
 * estimated token economics for the immune dashboard.
 */

import type Database from 'better-sqlite3'
import type { ImmuneLedgerEntry, ImmuneDashboardStats, AntigenKind } from './immune-types.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'immune-ledger.ts' })

/**
 * Returns confidence score for a pattern signature based on immune_memory occurrences.
 * 0 seen → 0.0 | 1 seen → 0.5 (propose) | 2 seen → 0.6 | ≥3 seen → 0.9 (auto-apply).
 */
export function getPatternConfidence(db: Database.Database, projectId: string, signature: string): number {
  try {
    const row = db
      .prepare('SELECT occurrences FROM immune_memory WHERE project_id = ? AND signature = ?')
      .get(projectId, signature) as { occurrences: number } | undefined
    if (!row) return 0.0
    if (row.occurrences >= 3) return 0.9
    if (row.occurrences === 2) return 0.6
    return 0.5
  } catch {
    return 0.0
  }
}

export function insertImmuneCycle(db: Database.Database, projectId: string, entry: ImmuneLedgerEntry): void {
  try {
    db.prepare(
      `INSERT INTO immune_ledger (id, project_id, cycle_id, signals_detected, antigens_presented, responses_generated, responses_applied, responses_gated, responses_failed_verify, recovery_rate, gate_pass_rate, verification_pass_rate, estimated_tokens_saved, estimated_tokens_spent, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      entry.id,
      projectId,
      entry.cycleId,
      entry.signalsDetected,
      entry.antigensPresented,
      entry.responsesGenerated,
      entry.responsesApplied,
      entry.responsesGated,
      entry.responsesFailedVerify,
      entry.recoveryRate,
      entry.gatePassRate,
      entry.verificationPassRate,
      entry.estimatedTokensSaved,
      entry.estimatedTokensSpent,
      entry.durationMs,
      entry.createdAt,
    )
  } catch (err) {
    log.warn('immune-ledger:insert-failed', { error: String(err) })
  }
}

export interface ImmuneSummary {
  totalCycles: number
  totalSignals: number
  totalAntigens: number
  totalResponses: number
  totalApplied: number
  totalGated: number
  totalFailedVerify: number
  averageRecoveryRate: number
  averageGatePassRate: number
  averageVerificationPassRate: number
  totalTokensSaved: number
  totalTokensSpent: number
  lastCycleAt: number | null
}

export function queryImmuneSummary(db: Database.Database, projectId: string): ImmuneSummary {
  try {
    const stats = db
      .prepare(
        `
      SELECT
        COUNT(*)                                            AS total_cycles,
        COALESCE(SUM(signals_detected), 0)                  AS total_signals,
        COALESCE(SUM(antigens_presented), 0)                AS total_antigens,
        COALESCE(SUM(responses_generated), 0)               AS total_responses,
        COALESCE(SUM(responses_applied), 0)                 AS total_applied,
        COALESCE(SUM(responses_gated), 0)                   AS total_gated,
        COALESCE(SUM(responses_failed_verify), 0)           AS total_failed_verify,
        COALESCE(AVG(recovery_rate), 0)                     AS avg_recovery,
        COALESCE(AVG(gate_pass_rate), 0)                    AS avg_gate_pass,
        COALESCE(AVG(verification_pass_rate), 0)            AS avg_verify_pass,
        COALESCE(SUM(estimated_tokens_saved), 0)            AS total_tokens_saved,
        COALESCE(SUM(estimated_tokens_spent), 0)            AS total_tokens_spent,
        MAX(created_at)                                     AS last_at
      FROM immune_ledger
      WHERE project_id = ?
    `,
      )
      .get(projectId) as {
      total_cycles: number
      total_signals: number
      total_antigens: number
      total_responses: number
      total_applied: number
      total_gated: number
      total_failed_verify: number
      avg_recovery: number
      avg_gate_pass: number
      avg_verify_pass: number
      total_tokens_saved: number
      total_tokens_spent: number
      last_at: number | null
    }

    return {
      totalCycles: stats.total_cycles,
      totalSignals: stats.total_signals,
      totalAntigens: stats.total_antigens,
      totalResponses: stats.total_responses,
      totalApplied: stats.total_applied,
      totalGated: stats.total_gated,
      totalFailedVerify: stats.total_failed_verify,
      averageRecoveryRate: stats.avg_recovery,
      averageGatePassRate: stats.avg_gate_pass,
      averageVerificationPassRate: stats.avg_verify_pass,
      totalTokensSaved: stats.total_tokens_saved,
      totalTokensSpent: stats.total_tokens_spent,
      lastCycleAt: stats.last_at,
    }
  } catch {
    return {
      totalCycles: 0,
      totalSignals: 0,
      totalAntigens: 0,
      totalResponses: 0,
      totalApplied: 0,
      totalGated: 0,
      totalFailedVerify: 0,
      averageRecoveryRate: 0,
      averageGatePassRate: 0,
      averageVerificationPassRate: 0,
      totalTokensSaved: 0,
      totalTokensSpent: 0,
      lastCycleAt: null,
    }
  }
}

export function listImmuneCycles(db: Database.Database, projectId: string, limit = 20): ImmuneLedgerEntry[] {
  try {
    return db
      .prepare('SELECT * FROM immune_ledger WHERE project_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(projectId, limit) as ImmuneLedgerEntry[]
  } catch {
    return []
  }
}

export function queryImmuneDashboard(db: Database.Database, projectId: string): ImmuneDashboardStats {
  const summary = queryImmuneSummary(db, projectId)

  let trendByCycle: ImmuneDashboardStats['trendByCycle'] = []
  try {
    const rows = db
      .prepare(
        `
      SELECT cycle_id, recovery_rate, gate_pass_rate, verification_pass_rate, duration_ms
      FROM immune_ledger
      WHERE project_id = ?
      ORDER BY created_at ASC
      LIMIT 50
    `,
      )
      .all(projectId) as Array<{
      cycle_id: string
      recovery_rate: number
      gate_pass_rate: number
      verification_pass_rate: number
      duration_ms: number
    }>
    trendByCycle = rows.map((r) => ({
      cycleId: r.cycle_id,
      recoveryRate: r.recovery_rate,
      gatePassRate: r.gate_pass_rate,
      verificationPassRate: r.verification_pass_rate,
      durationMs: r.duration_ms,
    }))
  } catch {
    /* no data */
  }

  let topAntigenKinds: ImmuneDashboardStats['topAntigenKinds'] = []
  try {
    const rows = db
      .prepare(
        `
      SELECT antigen_kind, COUNT(*) as count, AVG(recovery_success) as recovery_rate
      FROM immune_memory
      WHERE project_id = ?
      GROUP BY antigen_kind
      ORDER BY count DESC
      LIMIT 5
    `,
      )
      .all(projectId) as Array<{
      antigen_kind: string
      count: number
      recovery_rate: number
    }>
    topAntigenKinds = rows.map((r) => ({
      kind: r.antigen_kind as AntigenKind,
      count: r.count,
      recoveryRate: Math.round(r.recovery_rate * 100) / 100,
    }))
  } catch {
    /* table does not exist */
  }

  let topFilesBySignalDensity: ImmuneDashboardStats['topFilesBySignalDensity'] = []
  try {
    const rows = db
      .prepare(
        `
      SELECT file, COUNT(*) as signal_count
      FROM immune_memory
      WHERE project_id = ?
      GROUP BY file
      ORDER BY signal_count DESC
      LIMIT 5
    `,
      )
      .all(projectId) as Array<{
      file: string
      signal_count: number
    }>
    topFilesBySignalDensity = rows.map((r) => ({
      file: r.file,
      signalCount: r.signal_count,
    }))
  } catch {
    /* table does not exist */
  }

  return {
    totalCycles: summary.totalCycles,
    totalSignals: summary.totalSignals,
    totalAntigens: summary.totalAntigens,
    totalResponsesGenerated: summary.totalResponses,
    totalResponsesApplied: summary.totalApplied,
    totalResponsesGated: summary.totalGated,
    totalResponsesFailedVerify: summary.totalFailedVerify,
    avgRecoveryRate: summary.averageRecoveryRate,
    avgGatePassRate: summary.averageGatePassRate,
    avgVerificationPassRate: summary.averageVerificationPassRate,
    topAntigenKinds,
    topFilesBySignalDensity,
    costBenefitSummary: {
      estimatedTokensSaved: summary.totalTokensSaved,
      estimatedTokensSpent: summary.totalTokensSpent,
      netTokenBenefit: summary.totalTokensSaved - summary.totalTokensSpent,
    },
    trendByCycle,
    lastCycleAt: summary.lastCycleAt,
  }
}
