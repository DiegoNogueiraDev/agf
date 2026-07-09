/*!
 * index-honesty — computes ratio of selected vs corpus and bruteForce flag.
 * Task node_859d6f2e87f2.
 *
 * WHY: When more than half the corpus is selected, a brute-force full scan is
 * cheaper than index-based retrieval. This pure helper makes that decision
 * explicit and testable. Below MIN_CORPUS_SIZE the index is always used.
 *
 * Composes with: memory-salience.ts (SelectionResult), memory retrieval pipeline.
 */

import type { SelectionResult } from './memory-salience.js'

const BRUTE_FORCE_THRESHOLD = 0.5
const MIN_CORPUS_SIZE = 20

export interface IndexHonestyResult {
  ratio: number
  bruteForce: boolean
}

/** Compute index honesty ratio and brute-force recommendation. Pure function. */
export function computeIndexHonesty(selection: SelectionResult, corpusSize: number): IndexHonestyResult {
  const ratio = corpusSize > 0 ? selection.kept.length / corpusSize : 0
  const bruteForce = corpusSize >= MIN_CORPUS_SIZE && ratio > BRUTE_FORCE_THRESHOLD
  return { ratio, bruteForce }
}
