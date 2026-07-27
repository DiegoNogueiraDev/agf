/*!
 * index-honesty — computes ratio of selected vs corpus and bruteForce flag.
 * Task node_859d6f2e87f2. Wired as the sole implementation for
 * memory-salience.ts's computeIndexHonesty (task node_wire_e02f83681e80) —
 * that module used to duplicate this exact threshold math inline.
 *
 * WHY: When more than half the corpus is selected, a brute-force full scan is
 * cheaper than index-based retrieval. This pure helper makes that decision
 * explicit and testable. Below MIN_CORPUS_SIZE the index is always used.
 *
 * Composes with: memory-salience.ts (delegates its computeIndexHonesty here).
 */

const BRUTE_FORCE_THRESHOLD = 0.5
const MIN_CORPUS_SIZE = 20

export interface IndexHonestyResult {
  ratio: number
  bruteForce: boolean
}

/** Compute index honesty ratio and brute-force recommendation. Pure function. */
export function computeIndexHonesty(selected: number, corpusSize: number): IndexHonestyResult {
  const ratio = corpusSize > 0 ? selected / corpusSize : 0
  const bruteForce = corpusSize >= MIN_CORPUS_SIZE && ratio > BRUTE_FORCE_THRESHOLD
  return { ratio, bruteForce }
}
