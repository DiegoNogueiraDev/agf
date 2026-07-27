/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_b29dcb99cf9f + §node_02a65b80aced — Gate de qualidade 95/95: testes + logs precisam
 * atingir o limiar. Puro — o comando `quality` o usa para o veredito "projeto real testado
 * desde o 0".
 *
 * Calibração adaptativa (Cannon, 1926 — homeostase com setpoints regulados):
 * usa p75 do histórico de tasks done como setpoint, com floor ≥ 50% como banda de tolerância
 * mínima. Quando histórico insuficiente (<10 tasks), cai de volta para DEFAULT_THRESHOLDS.
 */

export interface QualityScores {
  testScore: number
  logScore: number
}

export interface QualityThresholds {
  tests: number
  logs: number
}

export interface QualityFailure {
  dimension: 'tests' | 'logs'
  score: number
  threshold: number
}

export interface QualityGateResult {
  passed: boolean
  failures: QualityFailure[]
  activeThresholds: QualityThresholds
  thresholdSource: 'default' | 'calibrated'
}

export interface CalibrationOptions {
  minSamples?: number
  floorTests?: number
  floorLogs?: number
}

export interface CalibrationResult {
  thresholds: QualityThresholds
  source: 'calibrated' | 'default'
}

/**
 * Lifecycle phases recognized by the quality gate.
 *
 * Homeostatic analogy (Cannon, 1926): setpoints vary by phase — body temperature
 * rises during exertion (IMPLEMENT), returns to baseline at rest (DEPLOY).
 */
export type LifecyclePhase = 'implement' | 'plan' | 'validate' | 'review' | 'handoff' | 'deploy'

/**
 * Per-phase multipliers applied to the calibrated setpoint.
 *
 * IMPLEMENT: 0.85 — tolerance for work-in-progress quality (not all tests green yet)
 * DEPLOY: 1.0 — full setpoint enforced before shipping to production
 */
export const PHASE_MULTIPLIERS: Record<LifecyclePhase, number> = {
  plan: 0.75,
  implement: 0.85,
  validate: 0.9,
  review: 0.95,
  handoff: 0.95,
  deploy: 1.0,
}

export const DEFAULT_THRESHOLDS: QualityThresholds = { tests: 95, logs: 95 }

/**
 * Applies the phase multiplier to a calibrated setpoint, returning phase-adjusted thresholds.
 *
 * Example: setpoint={tests:95, logs:95} + phase='implement' → {tests:81, logs:81}
 * (95 × 0.85 = 80.75, rounded to 81)
 */
export function getPhaseThresholds(phase: LifecyclePhase, setpoint: QualityThresholds): QualityThresholds {
  const multiplier = PHASE_MULTIPLIERS[phase]
  return {
    tests: Math.round(setpoint.tests * multiplier),
    logs: Math.round(setpoint.logs * multiplier),
  }
}

/** Computes the nearest-rank p75 of a sorted numeric array (0-indexed). */
function percentile75(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.ceil(sorted.length * 0.75) - 1
  return sorted[idx]
}

/**
 * Calibrates quality-gate thresholds using p75 of historical task scores.
 *
 * Requires minSamples (default 10) — returns DEFAULT_THRESHOLDS + source='default' when
 * the sample is too small for statistically meaningful calibration.
 *
 * Floor values prevent calibration from drifting below a minimum defensible threshold,
 * analogous to the homeostatic lower bound in physiological regulation (Cannon, 1926).
 */
export function calibrateQualityThresholds(
  historicalScores: QualityScores[],
  options: CalibrationOptions = {},
): CalibrationResult {
  const { minSamples = 10, floorTests = 50, floorLogs = 50 } = options

  if (historicalScores.length < minSamples) {
    return { thresholds: DEFAULT_THRESHOLDS, source: 'default' }
  }

  const p75Tests = percentile75(historicalScores.map((s) => s.testScore))
  const p75Logs = percentile75(historicalScores.map((s) => s.logScore))

  return {
    thresholds: {
      tests: Math.max(floorTests, p75Tests),
      logs: Math.max(floorLogs, p75Logs),
    },
    source: 'calibrated',
  }
}

/** Avalia o gate: cada dimensão abaixo do limiar vira uma failure. */
export function evaluateQualityGate(scores: QualityScores, thresholds?: QualityThresholds): QualityGateResult {
  const activeThresholds = thresholds ?? DEFAULT_THRESHOLDS
  const thresholdSource: 'default' | 'calibrated' = thresholds ? 'calibrated' : 'default'

  const failures: QualityFailure[] = []
  if (scores.testScore < activeThresholds.tests) {
    failures.push({ dimension: 'tests', score: scores.testScore, threshold: activeThresholds.tests })
  }
  if (scores.logScore < activeThresholds.logs) {
    failures.push({ dimension: 'logs', score: scores.logScore, threshold: activeThresholds.logs })
  }

  return { passed: failures.length === 0, failures, activeThresholds, thresholdSource }
}
