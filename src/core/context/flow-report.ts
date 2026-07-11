/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Flow Report — the empirical adjudicator (the paper's "Section 6" experiment).
 *
 * Cross-references {@link queryFlowMetrics} (tokens pruned per context call) with
 * {@link queryEpisodicOutcomes} (downstream success/partial/failure per node) to
 * answer the only question that matters: does flow dilution save tokens WITHOUT
 * raising the defect/reopen rate? Tokens are cheap to measure; correctness is the
 * real cost — this report makes the trade-off visible instead of assumed.
 *
 * Deterministic, read-only. §ADR-deterministic-first
 */

import type Database from 'better-sqlite3'
import { queryFlowMetrics, type FlowMetric } from './flow-metrics-store.js'
import { queryEpisodicOutcomes } from '../store/episodic-outcomes-store.js'

export interface FlowModeStats {
  samples: number
  avgPhi: number
  avgTokensBaseline: number
  avgTokensActual: number
  avgTokensSaved: number
  /** (avgSaved / avgBaseline) * 100 — never negative-clamped, honesty over optics. */
  tokensSavedPct: number
  /** Fraction of episodic outcomes (for nodes touched in this mode) that are NOT success. */
  defectRate: number
}

export type FlowVerdict = 'net_positive' | 'net_negative' | 'inconclusive' | 'no_data'

export interface FlowReport {
  flowOn: FlowModeStats
  flowOff: FlowModeStats
  verdict: FlowVerdict
  rationale: string
}

const EMPTY_STATS: FlowModeStats = {
  samples: 0,
  avgPhi: 0,
  avgTokensBaseline: 0,
  avgTokensActual: 0,
  avgTokensSaved: 0,
  tokensSavedPct: 0,
  defectRate: 0,
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function defectRateForNodes(db: Database.Database, nodeIds: ReadonlySet<string>): number {
  if (nodeIds.size === 0) return 0
  const outcomes = queryEpisodicOutcomes(db, { limit: 500 }).filter((o) => nodeIds.has(o.nodeId))
  if (outcomes.length === 0) return 0
  const defects = outcomes.filter((o) => o.outcome !== 'success').length
  return defects / outcomes.length
}

function statsForMode(db: Database.Database, metrics: FlowMetric[]): FlowModeStats {
  if (metrics.length === 0) return { ...EMPTY_STATS }
  const baseline = mean(metrics.map((m) => m.tokensBaseline))
  const actual = mean(metrics.map((m) => m.tokensActual))
  const saved = mean(metrics.map((m) => m.tokensBaseline - m.tokensActual))
  const nodeIds = new Set(metrics.map((m) => m.nodeId))
  return {
    samples: metrics.length,
    avgPhi: mean(metrics.map((m) => m.phi)),
    avgTokensBaseline: baseline,
    avgTokensActual: actual,
    avgTokensSaved: saved,
    tokensSavedPct: baseline > 0 ? (saved / baseline) * 100 : 0,
    defectRate: defectRateForNodes(db, nodeIds),
  }
}

/** Threshold (fraction) above which a defect-rate increase is considered real. */
const DEFECT_TOLERANCE = 0.05

/**
 * Build the A/B report comparing flow_on vs flow_off.
 *
 * Verdict policy (deterministic):
 *  - `no_data`        — no telemetry recorded yet.
 *  - `inconclusive`   — one arm missing, or savings/defects roughly tied.
 *  - `net_positive`   — flow saved tokens AND did not raise defects beyond tolerance.
 *  - `net_negative`   — flow raised the defect rate beyond tolerance (refutation #5 confirmed).
 */
export function computeFlowReport(db: Database.Database, projectId?: string): FlowReport {
  const on = queryFlowMetrics(db, { projectId, mode: 'flow_on', limit: 1000 })
  const off = queryFlowMetrics(db, { projectId, mode: 'flow_off', limit: 1000 })

  const flowOn = statsForMode(db, on)
  const flowOff = statsForMode(db, off)

  let verdict: FlowVerdict
  let rationale: string

  if (flowOn.samples === 0 && flowOff.samples === 0) {
    verdict = 'no_data'
    rationale = 'No flow telemetry recorded yet — enable flow.experiment.abEnabled and run some context() calls.'
  } else if (flowOn.samples === 0 || flowOff.samples === 0) {
    verdict = 'inconclusive'
    rationale = 'Need both flow_on and flow_off samples to compare — enable A/B mode for a controlled split.'
  } else if (flowOn.defectRate > flowOff.defectRate + DEFECT_TOLERANCE) {
    verdict = 'net_negative'
    rationale = `Flow saved ${flowOn.tokensSavedPct.toFixed(1)}% tokens but raised the defect rate from ${(flowOff.defectRate * 100).toFixed(1)}% to ${(flowOn.defectRate * 100).toFixed(1)}% — the token win did not pay for the correctness cost.`
  } else if (
    flowOn.tokensSavedPct > flowOff.tokensSavedPct &&
    flowOn.defectRate <= flowOff.defectRate + DEFECT_TOLERANCE
  ) {
    verdict = 'net_positive'
    rationale = `Flow saved ${flowOn.tokensSavedPct.toFixed(1)}% tokens (vs ${flowOff.tokensSavedPct.toFixed(1)}% baseline) with no defect-rate regression — elastic attention is paying off.`
  } else {
    verdict = 'inconclusive'
    rationale = 'Token savings and defect rates are within noise — keep collecting samples.'
  }

  return { flowOn, flowOff, verdict, rationale }
}
