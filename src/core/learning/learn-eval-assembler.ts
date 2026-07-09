/*!
 * learn-eval-assembler — pure assembler for the `agf learn-eval` command.
 *
 * WHY: the CLI command is a thin Commander wrapper; this module holds the
 * testable logic — reads PerfRecord[] from a LearningStore, computes
 * accuracy / regret / Brier / ECE, and delegates to buildLearningPrecision
 * for the composite score. Zero duplicate formula logic.
 *
 * Composes with: sqlite-learning-store.ts (data), learning-precision.ts (formula),
 *   calibration.ts (brier/ece), learn-eval-cmd.ts (CLI wrapper).
 */

import { brierScore, ece, buildCalibrationBins } from './calibration.js'
import { buildLearningPrecision, type LearningPrecisionReport } from './learning-precision.js'
import type { LearningStore } from './learning-actions.js'

/**
 * Read all PerfRecord entries from the store and produce a LearningPrecisionReport.
 * Empty store returns a zero-baseline report (accuracy=0, regret=1, meetsTarget=false).
 */
export function assembleLearnEval(store: LearningStore): LearningPrecisionReport {
  const records = store.readAll()

  if (records.length === 0) {
    return buildLearningPrecision({ accuracy: 0, regret: 1, brier: 0, ece: 0 })
  }

  const accuracy = records.filter((r) => r.acPassed).length / records.length
  const regret = 1 - accuracy

  // Use accuracy as the predicted probability for each record (single-agent estimate)
  const predicted = records.map(() => accuracy)
  const actual = records.map((r) => (r.acPassed ? 1 : 0))

  const brier = brierScore(predicted, actual)
  const bins = buildCalibrationBins(predicted, actual)
  const ecScore = ece(bins)

  return buildLearningPrecision({ accuracy, regret, brier, ece: ecScore })
}
