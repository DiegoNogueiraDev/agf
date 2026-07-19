/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Seen-sketch — a Bloom filter for cross-turn dedup of already-sent content.
 *
 * Math anchor: Bloom (1970) — probabilistic set membership in **sublinear space**,
 * with zero false negatives and a tunable false-positive rate `(1 − e^{−kn/m})^k`.
 * Bit positions are derived by Kirsch–Mitzenmacher double hashing from one FNV-1a
 * 64-bit digest (reuses the project hash → deterministic, zero new deps).
 *
 * Token-economy lever `seen_sketch`: a per-session sketch of chunk hashes lets a
 * caller skip re-sending content the executor already received (enables the
 * predictive-coding "context diff", backlog item 7).
 */

import { fnv1a64 } from '../cache/cache-types.js'
import { McpGraphError } from '../utils/errors.js'

export interface SeenSketchOptions {
  /** Number of bits in the filter (m). Larger ⇒ lower false-positive rate. Default 8192. */
  bits?: number
  /** Number of hash probes (k). Default 4. */
  hashes?: number
}

const DEFAULT_BITS = 8192
const DEFAULT_HASHES = 4

export class SeenSketch {
  private readonly bits: number
  private readonly hashes: number
  private readonly buckets: Uint8Array
  private added = 0
  /**
   * Exact membership of added keys. The Bloom {@link has} probe has false
   * POSITIVES, so it must never be the sole basis for an *irreversible* action
   * (e.g. collapsing a chunk to a marker in the context-diff). This set lets a
   * caller confirm a Bloom hit is real before discarding content. See AUDIT-044.
   */
  private readonly seenExact = new Set<string>()

  constructor(opts: SeenSketchOptions = {}) {
    const bits = opts.bits ?? DEFAULT_BITS
    const hashes = opts.hashes ?? DEFAULT_HASHES
    if (!Number.isInteger(bits) || bits <= 0)
      throw new McpGraphError(`SeenSketch: bits must be a positive integer (got ${bits})`)
    if (!Number.isInteger(hashes) || hashes <= 0)
      throw new McpGraphError(`SeenSketch: hashes must be a positive integer (got ${hashes})`)
    this.bits = bits
    this.hashes = hashes
    this.buckets = new Uint8Array(Math.ceil(bits / 8))
  }

  /** Record a key as seen. */
  add(key: string): void {
    for (const pos of this.positions(key)) this.buckets[pos >>> 3] |= 1 << (pos & 7)
    this.seenExact.add(key)
    this.added++
  }

  /** True if the key was (probably) seen; false is definitive (no false negatives). */
  has(key: string): boolean {
    for (const pos of this.positions(key)) {
      if ((this.buckets[pos >>> 3] & (1 << (pos & 7))) === 0) return false
    }
    return true
  }

  /**
   * True only if the key was *exactly* added (no false positives). Use this — not
   * {@link has} — before any irreversible decision that discards the key's
   * content, so a Bloom false positive can never drop never-seen data (AUDIT-044).
   */
  confirmedHas(key: string): boolean {
    return this.seenExact.has(key)
  }

  /** Clear all membership (e.g. on a new session). */
  reset(): void {
    this.buckets.fill(0)
    this.seenExact.clear()
    this.added = 0
  }

  /** Number of `add()` calls since construction/reset (not distinct membership). */
  get size(): number {
    return this.added
  }

  /** Kirsch–Mitzenmacher double hashing: `(h1 + i·h2) mod m` from one FNV-1a digest. */
  private positions(key: string): number[] {
    const digest = fnv1a64(key)
    const h1 = Number.parseInt(digest.slice(0, 8), 16) >>> 0
    const h2 = Number.parseInt(digest.slice(8, 16), 16) >>> 0 || 1 // never 0 → distinct probes
    const out: number[] = new Array(this.hashes)
    for (let i = 0; i < this.hashes; i++) out[i] = ((h1 + i * h2) >>> 0) % this.bits
    return out
  }
}

/**
 * Analytic false-positive rate of a Bloom filter: `(1 − e^{−k·n/m})^k`.
 * `m` = bits, `k` = hashes, `n` = inserted items.
 */
export function estimateFalsePositiveRate(bits: number, hashes: number, inserted: number): number {
  if (bits <= 0 || hashes <= 0) return 1
  return Math.pow(1 - Math.exp((-hashes * inserted) / bits), hashes)
}
