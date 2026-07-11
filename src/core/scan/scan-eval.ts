/*!
 * scan-eval — precision/recall/F1 against a labeled gold-set.
 *
 * WHY: "presentInAgf >= 99% precision" is unfalsifiable without a reference set.
 * This module provides the evaluation harness: compare scan predictions against
 * hand-labeled gold entries and compute standard IR metrics. Used by
 * `agf scan-repos --eval` to enforce the KR numerically.
 *
 * Pure, deterministic, 0-token. Gold fixture lives at
 * src/tests/fixtures/scan/gold-capabilities.json.
 *
 * Composing: agf-presence-checker.ts produces the predictions;
 * repo-scanner.ts feeds the capability list; this module scores them.
 */

/** A labeled ground-truth entry for a capability. */
export interface GoldEntry {
  capability: string
  /** Whether agf genuinely has this capability. */
  presentInAgf: boolean
}

/** A prediction from the scanner pipeline. */
export interface ScanPrediction {
  capability: string
  /** Predicted by the scanner. */
  presentInAgf: boolean
}

export interface ScanEvalResult {
  /** True positives: predicted present AND gold = present. */
  tp: number
  /** False positives: predicted present BUT gold = absent. */
  fp: number
  /** False negatives: predicted absent BUT gold = present. */
  fn: number
  /** TP / (TP + FP). Returns 1 when TP+FP=0 (no positive predictions). */
  precision: number
  /** TP / (TP + FN). Returns 1 when TP+FN=0 (no positive gold labels). */
  recall: number
  /** Harmonic mean of precision and recall. */
  f1: number
  /** Number of gold entries evaluated. */
  total: number
}

/**
 * Compute precision/recall/F1 of `predictions` against `gold`.
 * Unmatched capabilities (in gold but not in predictions) count as FN.
 * Extra predictions (not in gold) are ignored (out-of-scope).
 */
export function computeScanEval(gold: GoldEntry[], predictions: ScanPrediction[]): ScanEvalResult {
  const predMap = new Map<string, boolean>()
  for (const p of predictions) predMap.set(p.capability, p.presentInAgf)

  let tp = 0
  let fp = 0
  let fn = 0

  for (const g of gold) {
    const pred = predMap.get(g.capability)
    if (pred === undefined) {
      // Not predicted → treat as negative prediction
      if (g.presentInAgf) fn++
      // True negative — not counted in IR metrics
    } else if (pred && g.presentInAgf) {
      tp++
    } else if (pred && !g.presentInAgf) {
      fp++
    } else if (!pred && g.presentInAgf) {
      fn++
    }
    // !pred && !g.presentInAgf → true negative, not counted
  }

  const precision = tp + fp === 0 ? 1 : tp / (tp + fp)
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn)
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)

  return {
    tp,
    fp,
    fn,
    precision: Math.round(precision * 1e6) / 1e6,
    recall: Math.round(recall * 1e6) / 1e6,
    f1: Math.round(f1 * 1e6) / 1e6,
    total: gold.length,
  }
}
