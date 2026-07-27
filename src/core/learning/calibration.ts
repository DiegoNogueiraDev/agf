/*!
 * Calibration metrics: Brier score + ECE (Expected Calibration Error).
 *
 * WHY: raw accuracy metrics do not tell us if the model's confidence scores are
 * reliable. Brier score penalises miscalibrated probabilities; ECE measures
 * average gap between predicted probability and observed frequency across bins.
 * Both are required by the OPE / bandit evaluation pipeline.
 *
 * Composes with: ope-evaluator.ts (consumer), learning/record-task-learning.ts.
 */

/** Thrown for invalid inputs (empty arrays, mismatched lengths). */
export class LearningError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LearningError'
  }
}

/** One calibration bin: predicted probability bucket vs observed frequency. */
export interface EceBin {
  meanPredicted: number
  meanActual: number
  /** Number of samples in this bin — used as weight. */
  n: number
}

/**
 * Brier score = mean squared error between predicted probabilities and binary outcomes.
 * Lower is better; 0 = perfect, 1 = worst possible.
 */
export function brierScore(predicted: number[], actual: number[]): number {
  if (predicted.length === 0 || actual.length === 0) {
    throw new LearningError('brierScore requires at least one prediction')
  }
  if (predicted.length !== actual.length) {
    throw new LearningError(`brierScore: predicted length ${predicted.length} !== actual length ${actual.length}`)
  }
  let sum = 0
  for (let i = 0; i < predicted.length; i++) {
    const diff = predicted[i]! - actual[i]!
    sum += diff * diff
  }
  return sum / predicted.length
}

/**
 * Group (predicted, actual) pairs into N equal-width bins over [0, 1].
 * Useful for computing ECE from raw probability + binary outcome arrays.
 */
export function buildCalibrationBins(predicted: number[], actual: number[], nBins = 10): EceBin[] {
  if (predicted.length !== actual.length) {
    throw new LearningError(`buildCalibrationBins: length mismatch ${predicted.length} vs ${actual.length}`)
  }
  const bins: Array<{ sumPred: number; sumAct: number; n: number }> = Array.from({ length: nBins }, () => ({
    sumPred: 0,
    sumAct: 0,
    n: 0,
  }))
  for (let i = 0; i < predicted.length; i++) {
    const p = Math.min(1, Math.max(0, predicted[i]!))
    const idx = Math.min(nBins - 1, Math.floor(p * nBins))
    bins[idx]!.sumPred += p
    bins[idx]!.sumAct += actual[i]!
    bins[idx]!.n++
  }
  return bins
    .filter((b) => b.n > 0)
    .map((b) => ({ meanPredicted: b.sumPred / b.n, meanActual: b.sumAct / b.n, n: b.n }))
}

/**
 * Expected Calibration Error — weighted mean absolute difference between
 * predicted probability and actual frequency across calibration bins.
 * Returns 0 for empty bins.
 */
export function ece(bins: EceBin[]): number {
  if (bins.length === 0) return 0
  const totalN = bins.reduce((s, b) => s + b.n, 0)
  if (totalN === 0) return 0
  let weighted = 0
  for (const bin of bins) {
    weighted += (bin.n / totalN) * Math.abs(bin.meanPredicted - bin.meanActual)
  }
  return weighted
}
