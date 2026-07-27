/*!
 * seeded-prng — single source of truth for the project's seeded PRNG.
 *
 * WHY: both the GA hyperparameter search (ga-driver.ts) and ACO roulette selection
 * (`agf next --aco`) need reproducible randomness. Duplicating the generator would let the
 * two paths silently diverge; centralising it keeps determinism guarantees in one place and
 * satisfies the "single seedable RNG source" constraint (node_3ab1e8771b4a).
 *
 * xorshift32: fast, deterministic, uniform in [0, 1). Seed 0 is remapped to 1 (xorshift
 * cannot escape the all-zero state).
 */

/** Seeded xorshift32 PRNG — returns uniform values in [0, 1). Same seed → same sequence. */
export function makeSeededPrng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 0x100000000
  }
}
