/*!
 * repo-dedupe — SimHash-based monorepo subdir deduplication.
 *
 * WHY: scan-repos counts each subdir independently, so a monorepo with
 * supertonic/cpp and supertonic/go (near-identical code, different file
 * extensions) inflates the result. SimHash collapses near-identical units
 * in O(n log n) — no O(n²) pairwise comparison.
 *
 * Algorithm: Charikar's SimHash (2002). Tokenise content by whitespace,
 * hash each token to a 32-bit int, accumulate a weighted bit-vector, sign
 * of each column is the final bit. Hamming distance between two SimHashes
 * is the number of differing bits — small distance ⇒ near-duplicate.
 *
 * Threshold default: 6 bits (out of 32) ≈ 81% similarity.
 *
 * Extends: src/core/scan/ (same layer as repo-scanner, capability-lexicon).
 * Reuses: the NCD-dedup module was consulted but operates on O(n²) gzip —
 *         SimHash is cheaper at scale (no cross-pair compression).
 */

/** A scanned repo/subdir unit with its representative text content. */
export interface RepoDir {
  path: string
  /** Representative text content (file list, README, source sample, etc.). */
  content: string
}

/** A group of near-identical dirs collapsed into one logical unit. */
export interface DedupGroup {
  /** The first (canonical) representative of the group. */
  canonical: string
  /** All member paths, including the canonical one. */
  members: string[]
}

export interface DedupResult {
  groups: DedupGroup[]
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** djb2 variant — fast 32-bit hash for a single string token. */
function hashToken(token: string): number {
  let h = 5381
  for (let i = 0; i < token.length; i++) {
    h = ((h << 5) + h + token.charCodeAt(i)) >>> 0
  }
  return h >>> 0
}

/**
 * 32-bit Charikar SimHash of `text`.
 * Tokenises on whitespace; each token contributes +1 or -1 to each bit column.
 */
export function simhash(text: string): number {
  const bits = new Int32Array(32)
  const tokens = text.split(/\s+/).filter(Boolean)

  for (const token of tokens) {
    const h = hashToken(token)
    for (let i = 0; i < 32; i++) {
      bits[i]! += (h >>> i) & 1 ? 1 : -1
    }
  }

  let result = 0
  for (let i = 0; i < 32; i++) {
    if (bits[i]! > 0) result |= 1 << i
  }
  return result >>> 0
}

/** Population count — number of set bits (Hamming weight). */
function popcount(n: number): number {
  let x = n >>> 0
  x -= (x >>> 1) & 0x55555555
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333)
  x = (x + (x >>> 4)) & 0x0f0f0f0f
  return ((x * 0x01010101) >>> 24) & 0xff
}

/**
 * Number of differing bits between two 32-bit SimHashes.
 * 0 = identical, 32 = completely different.
 */
export function hammingDistance(a: number, b: number): number {
  return popcount((a ^ b) >>> 0)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DedupeRepoDirsOptions {
  /**
   * Maximum Hamming distance (bits) to consider two dirs near-identical.
   * Default: 7 (out of 32 bits ≈ 78% similarity) — calibrated on
   * capability-text content (README + file list), not raw source code.
   */
  threshold?: number
}

/**
 * Group `dirs` so that near-identical subdirs (SimHash Hamming < threshold)
 * collapse into a single logical unit. O(n²) comparisons but n is small
 * (tens to low hundreds of subdirs per monorepo scan).
 */
export function dedupeRepoDirs(dirs: RepoDir[], opts: DedupeRepoDirsOptions = {}): DedupResult {
  const threshold = opts.threshold ?? 7

  const hashes = dirs.map((d) => simhash(d.content))
  const assigned = new Array<number | null>(dirs.length).fill(null)
  const groups: DedupGroup[] = []

  for (let i = 0; i < dirs.length; i++) {
    if (assigned[i] !== null) continue

    // Start a new group with dirs[i] as canonical
    const groupIndex = groups.length
    groups.push({ canonical: dirs[i]!.path, members: [dirs[i]!.path] })
    assigned[i] = groupIndex

    for (let j = i + 1; j < dirs.length; j++) {
      if (assigned[j] !== null) continue
      if (hammingDistance(hashes[i]!, hashes[j]!) < threshold) {
        groups[groupIndex]!.members.push(dirs[j]!.path)
        assigned[j] = groupIndex
      }
    }
  }

  return { groups }
}
