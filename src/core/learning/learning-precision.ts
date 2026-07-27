/*!
 * Composite learning-precision score (Task node_6b727b01fde2).
 *
 * WHY: accuracy, regret, Brier, and ECE are each partial signals. The composite
 * precisionScore gives a single number for dashboards and gate checks, while the
 * full report keeps all components for diagnostics.
 *
 * Formula: precisionScore = w_acc*accuracy + w_brier*(1-brier) + w_ece*(1-ece)
 * Weights: accuracy=0.5, brier=0.3, ece=0.2 (accuracy dominates per AC1/AC2 design).
 * meetsTarget: accuracy >= TARGET_ACCURACY && brier <= TARGET_BRIER.
 *
 * Composes with: ope-evaluator.ts, calibration.ts.
 */

const TARGET_ACCURACY = 0.99
const TARGET_BRIER = 0.1

const W_ACCURACY = 0.5
const W_BRIER = 0.3
const W_ECE = 0.2

export interface LearningPrecisionInput {
  accuracy: number
  regret: number
  brier: number
  ece: number
}

export interface LearningPrecisionReport {
  accuracy: number
  regret: number
  brier: number
  ece: number
  precisionScore: number
  meetsTarget: boolean
}

/** Build composite learning-precision report from OPE + calibration metrics. */
export function buildLearningPrecision(input: LearningPrecisionInput): LearningPrecisionReport {
  const { accuracy, regret, brier, ece } = input
  const precisionScore = Math.min(1, Math.max(0, W_ACCURACY * accuracy + W_BRIER * (1 - brier) + W_ECE * (1 - ece)))
  const meetsTarget = accuracy >= TARGET_ACCURACY && brier <= TARGET_BRIER
  return { accuracy, regret, brier, ece, precisionScore, meetsTarget }
}
