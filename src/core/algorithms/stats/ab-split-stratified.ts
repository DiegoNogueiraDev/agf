/*!
 * ab-split-stratified — seeded, stratified random A/B assignment.
 *
 * WHY: The calibrate command previously used `i % 2 === 0/1` (positional split)
 * which is non-random and biased by sample ordering. A stratified random split
 * with a reproducible seed gives unbiased group assignment while remaining
 * deterministic for tests.
 *
 * Algorithm: mulberry32 PRNG (32-bit, seedable, good distribution for N<10k),
 * Fisher-Yates shuffle on indices, split down the middle. Each group gets
 * exactly floor(N/2) or ceil(N/2) samples.
 *
 * Extends: src/core/algorithms/stats/ (same layer as welch-t-test, chi-square).
 */

export interface AbSplitOptions {
  /** Integer seed for reproducibility (required for determinism in tests). */
  seed: number
}

export interface AbSplitResult<T = number> {
  groupA: T[]
  groupB: T[]
}

/** Mulberry32 — simple 32-bit seeded PRNG with good distribution. Returns [0, 1). */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s += 0x6d2b79f5
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000
  }
}

/**
 * Split `samples` into two groups via seeded Fisher-Yates shuffle + midpoint split.
 * Both groups together contain every element exactly once (no duplicates, no drops).
 *
 * @param samples - Values to split.
 * @param opts    - Requires `seed` for reproducibility.
 */
export function abSplitStratified<T>(samples: T[], opts: AbSplitOptions): AbSplitResult<T> {
  const rand = mulberry32(opts.seed)
  const indices = samples.map((_, i) => i)

  // Fisher-Yates shuffle on indices (pure — samples array untouched)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = indices[i]
    indices[i] = indices[j]!
    indices[j] = tmp!
  }

  const mid = Math.floor(indices.length / 2)
  const groupA = indices.slice(0, mid).map((i) => samples[i] as T)
  const groupB = indices.slice(mid).map((i) => samples[i] as T)

  return { groupA, groupB }
}
