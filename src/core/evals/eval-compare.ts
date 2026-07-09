/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Eval comparison utilities for Task 2.4 — Dogfood Measurement Haiku-first.
 *
 * `compareEvalSessions` compares two session IDs from llm_call_ledger + eval_run,
 * producing a cost/token/quality delta report for `agf eval --compare`.
 *
 * `meetsQualityThreshold` checks whether a run satisfies the quality gate
 * (≥minPassRate of scenarios with score ≥ minScore).
 */
import type Database from 'better-sqlite3'

export interface SessionStats {
  sessionId: string
  calls: number
  totalTokensIn: number
  totalTokensOut: number
  totalCostUsd: number
  avgTokensIn: number
  avgCostUsd: number
  quality?: QualityStats
}

export interface QualityStats {
  total: number
  passed: number
  passRate: number
  avgScore: number
}

export interface CompareReport {
  sessionA: string
  sessionB: string
  a: SessionStats
  b: SessionStats
  /** B.totalTokensIn - A.totalTokensIn. Negative = B uses fewer input tokens. */
  deltaTokensIn: number
  /** B.totalCostUsd - A.totalCostUsd. Negative = B is cheaper. */
  deltaCostUsd: number
  /**
   * Cost reduction percentage: (A.cost - B.cost) / A.cost * 100.
   * Positive = B saved tokens vs A. 0 when A.cost = 0.
   */
  savingsPct: number
}

interface LedgerAgg {
  calls: number
  tin: number
  tout: number
  cost: number
}

interface EvalAgg {
  total: number
  passed: number
  avg_score: number
}

function queryLedger(db: Database.Database, sessionId: string): LedgerAgg {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS calls,
         COALESCE(SUM(input_tokens), 0) AS tin,
         COALESCE(SUM(output_tokens), 0) AS tout,
         COALESCE(SUM(cost_usd), 0) AS cost
       FROM llm_call_ledger
       WHERE session_id = ?`,
    )
    .get(sessionId) as LedgerAgg | undefined
  return row ?? { calls: 0, tin: 0, tout: 0, cost: 0 }
}

function queryEvalRun(db: Database.Database, runId: string): EvalAgg | null {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(passed), 0) AS passed,
         COALESCE(AVG(score), 0) AS avg_score
       FROM eval_run
       WHERE run_id = ?`,
    )
    .get(runId) as { total: number; passed: number; avg_score: number } | undefined
  if (!row || row.total === 0) return null
  return { total: row.total, passed: row.passed, avg_score: row.avg_score }
}

function buildStats(sessionId: string, ledger: LedgerAgg, eval_: EvalAgg | null): SessionStats {
  const quality: QualityStats | undefined = eval_
    ? {
        total: eval_.total,
        passed: eval_.passed,
        passRate: eval_.total > 0 ? eval_.passed / eval_.total : 0,
        avgScore: eval_.avg_score,
      }
    : undefined
  return {
    sessionId,
    calls: ledger.calls,
    totalTokensIn: ledger.tin,
    totalTokensOut: ledger.tout,
    totalCostUsd: ledger.cost,
    avgTokensIn: ledger.calls > 0 ? Math.round(ledger.tin / ledger.calls) : 0,
    avgCostUsd: ledger.calls > 0 ? ledger.cost / ledger.calls : 0,
    quality,
  }
}

/**
 * Compares two eval sessions by querying `llm_call_ledger` and `eval_run`.
 * The session IDs are used as both the `session_id` in the ledger and the
 * `run_id` in eval_run — this matches how `agf eval --suite dogfood --live`
 * persists results with `sessionId: '<label>'`.
 */
export function compareEvalSessions(db: Database.Database, sessionA: string, sessionB: string): CompareReport {
  const ledgerA = queryLedger(db, sessionA)
  const ledgerB = queryLedger(db, sessionB)
  const evalA = queryEvalRun(db, sessionA)
  const evalB = queryEvalRun(db, sessionB)

  const a = buildStats(sessionA, ledgerA, evalA)
  const b = buildStats(sessionB, ledgerB, evalB)

  const deltaTokensIn = b.totalTokensIn - a.totalTokensIn
  const deltaCostUsd = b.totalCostUsd - a.totalCostUsd
  const savingsPct = a.totalCostUsd > 0 ? ((a.totalCostUsd - b.totalCostUsd) / a.totalCostUsd) * 100 : 0

  return { sessionA, sessionB, a, b, deltaTokensIn, deltaCostUsd, savingsPct }
}

export interface QualityThresholdResult {
  passes: boolean
  total: number
  aboveThreshold: number
  passRate: number
  avgScore: number
}

export interface CiGateResult {
  passes: boolean
  /** (currentCost - baseline) / baseline * 100. Null when no baseline exists. */
  costRegressionPct: number | null
  qualityPassRate: number
  failReasons: string[]
}

export interface CiGateOptions {
  /** Maximum allowed cost regression in %. Default: 10. */
  maxCostRegressionPct: number
  /** Minimum score for a scenario to count as passing. Default: 0.80. */
  minQualityScore: number
  /** Minimum fraction of scenarios that must pass. Default: 0.70. */
  minQualityPassRate: number
}

/**
 * Pure CI gate check: cost-regression guard + quality threshold.
 *
 * @param currentCost - Total cost USD from the current run.
 * @param quality - Output of `meetsQualityThreshold` for the current run.
 * @param baselineCost - Baseline cost from prior run; null = first run (skip cost check).
 * @param opts - Gate thresholds.
 */
export function checkCiGate(
  currentCost: number,
  quality: QualityThresholdResult,
  baselineCost: number | null,
  opts: CiGateOptions,
): CiGateResult {
  const failReasons: string[] = []

  let costRegressionPct: number | null = null
  if (baselineCost !== null && baselineCost > 0) {
    costRegressionPct = ((currentCost - baselineCost) / baselineCost) * 100
    if (costRegressionPct > opts.maxCostRegressionPct) {
      failReasons.push(`cost regression ${costRegressionPct.toFixed(1)}% > ${opts.maxCostRegressionPct}% threshold`)
    }
  }

  // Only check quality when there are scenarios — no data is not a failure
  if (quality.total > 0 && quality.passRate < opts.minQualityPassRate) {
    failReasons.push(
      `quality pass rate ${(quality.passRate * 100).toFixed(1)}% < ${(opts.minQualityPassRate * 100).toFixed(0)}% ` +
        `(axis: score<${opts.minQualityScore} in ${quality.total - quality.aboveThreshold}/${quality.total} scenarios)`,
    )
  }

  return {
    passes: failReasons.length === 0,
    costRegressionPct,
    qualityPassRate: quality.passRate,
    failReasons,
  }
}

/**
 * Checks whether a run meets the quality gate:
 * at least `minPassRate` fraction of scenarios must have score ≥ `minScore`.
 */
export function meetsQualityThreshold(
  db: Database.Database,
  runId: string,
  opts: { minScore: number; minPassRate: number },
): QualityThresholdResult {
  const { minScore, minPassRate } = opts
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN score >= ? THEN 1 ELSE 0 END), 0) AS above,
         COALESCE(AVG(score), 0) AS avg_score
       FROM eval_run
       WHERE run_id = ?`,
    )
    .get(minScore, runId) as { total: number; above: number; avg_score: number } | undefined

  const total = row?.total ?? 0
  const aboveThreshold = row?.above ?? 0
  const avgScore = row?.avg_score ?? 0
  const passRate = total > 0 ? aboveThreshold / total : 0
  const passes = total > 0 && passRate >= minPassRate

  return { passes, total, aboveThreshold, passRate, avgScore }
}

export interface ScenarioDiffRow {
  goldenId: string
  scoreA: number | null
  scoreB: number | null
  costA: number | null
  costB: number | null
  passedA: boolean | null
  passedB: boolean | null
  /** costB - costA. Null when either is missing. */
  deltaCost: number | null
  /** scoreB - scoreA. Null when either is missing. */
  deltaScore: number | null
}

interface RunRow {
  golden_id: string
  score: number
  passed: number
  cost_usd: number
}

/**
 * Per-scenario diff between two eval run IDs.
 * Uses a FULL OUTER JOIN (emulated with UNION) so scenarios that appear in
 * only one run show null values for the other side.
 */
export function compareEvalRunsPerScenario(db: Database.Database, runIdA: string, runIdB: string): ScenarioDiffRow[] {
  const rowsA = db
    .prepare('SELECT golden_id, score, passed, cost_usd FROM eval_run WHERE run_id = ?')
    .all(runIdA) as RunRow[]
  const rowsB = db
    .prepare('SELECT golden_id, score, passed, cost_usd FROM eval_run WHERE run_id = ?')
    .all(runIdB) as RunRow[]

  const mapA = new Map(rowsA.map((r) => [r.golden_id, r]))
  const mapB = new Map(rowsB.map((r) => [r.golden_id, r]))
  const allIds = new Set([...mapA.keys(), ...mapB.keys()])

  const result: ScenarioDiffRow[] = []
  for (const id of allIds) {
    const a = mapA.get(id) ?? null
    const b = mapB.get(id) ?? null
    const costA = a ? a.cost_usd : null
    const costB = b ? b.cost_usd : null
    const scoreA = a ? a.score : null
    const scoreB = b ? b.score : null
    result.push({
      goldenId: id,
      scoreA,
      scoreB,
      costA,
      costB,
      passedA: a !== null ? a.passed === 1 : null,
      passedB: b !== null ? b.passed === 1 : null,
      deltaCost: costA !== null && costB !== null ? costB - costA : null,
      deltaScore: scoreA !== null && scoreB !== null ? scoreB - scoreA : null,
    })
  }
  return result.sort((a, b) => a.goldenId.localeCompare(b.goldenId))
}
