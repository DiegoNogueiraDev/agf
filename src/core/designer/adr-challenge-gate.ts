/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * ADR Challenge Gate — automatic gate for DESIGN→PLAN transition.
 *
 * Task 3.1 (node_e8037dd236ae) — Epic: Lifecycle Integration
 *
 * Runs adr_challenge for all decision nodes before allowing phase transition.
 * Modes: strict (block on failure), advisory (warn), off (skip).
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { runAllAdrChallenges, type AdrChallengeResult } from './adr-challenge-runner.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'adr-challenge-gate.ts' })

// ── Types ───────────────────────────────────────────────

export type GateMode = 'strict' | 'advisory' | 'off'

export interface GateWarning {
  code: string
  message: string
  severity: 'error' | 'warning' | 'info'
}

export interface AdrChallengeGateResult {
  blocked: boolean
  totalDecisions: number
  reports: AdrChallengeResult[]
  failedDecisions: Array<{ nodeId: string; title: string; verdict: string; score: number }>
  warnings: GateWarning[]
}

// ── Gate Function ───────────────────────────────────────

/**
 * Run the ADR Challenge Gate for DESIGN→PLAN transition.
 *
 * - strict: blocks if any decision has CHALLENGE_FAILED
 * - advisory: warns but allows transition
 * - off: skips all verification
 */
export function runAdrChallengeGate(store: SqliteStore, mode: GateMode): AdrChallengeGateResult {
  // Off mode: skip entirely
  if (mode === 'off') {
    log.debug('adr-challenge-gate: off mode, skipping')
    return {
      blocked: false,
      totalDecisions: 0,
      reports: [],
      failedDecisions: [],
      warnings: [],
    }
  }

  // Run challenges for all decision nodes
  const resultValue = runAllAdrChallenges(store)

  // Zero decisions case
  if (resultValue.summary.totalDecisions === 0) {
    log.info('adr-challenge-gate: no decision nodes found')
    return {
      blocked: false,
      totalDecisions: 0,
      reports: [],
      failedDecisions: [],
      warnings: [
        {
          code: 'no_decisions',
          message: 'no decisions to challenge — consider adding ADRs',
          severity: 'warning',
        },
      ],
    }
  }

  // Collect failed decisions
  const failedDecisions = resultValue.reports
    .filter((r) => r.report.overallVerdict.verdict === 'CHALLENGE_FAILED')
    .map((r) => ({
      nodeId: r.nodeId,
      title: r.nodeTitle,
      verdict: r.report.overallVerdict.verdict,
      score: r.report.fitnessScore.composite,
    }))

  // Build warnings
  const warnings: GateWarning[] = []
  if (failedDecisions.length > 0) {
    const names = failedDecisions.map((d) => `${d.title} (${d.score}/100)`).join(', ')
    warnings.push({
      code: 'challenge_failed',
      message: `${failedDecisions.length} decision(s) failed challenge: ${names}`,
      severity: mode === 'strict' ? 'error' : 'warning',
    })
  }

  // Block in strict mode if any failures
  const blocked = mode === 'strict' && failedDecisions.length > 0

  log.info('adr-challenge-gate:result', {
    mode,
    totalDecisions: resultValue.summary.totalDecisions,
    passed: resultValue.summary.passed,
    failed: resultValue.summary.failed,
    blocked,
  })

  return {
    blocked,
    totalDecisions: resultValue.summary.totalDecisions,
    reports: resultValue.reports,
    failedDecisions,
    warnings,
  }
}
