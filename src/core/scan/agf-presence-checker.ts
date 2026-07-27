/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * agf-presence-checker — high-precision "does agf already have this?" via
 * Bloom pre-filter + NCD (Li-Vitányi 2005) against the agf capability corpus.
 *
 * WHY: exact membership in capability-lexicon.ts produces false-negatives for
 * capabilities described with different vocabulary (e.g. "content router" vs
 * "CCR"). NCD over gzip compares information content, catching near-matches
 * regardless of naming. Bloom pre-filter skips the NCD computation for obvious
 * absent terms (cheap; never false-negative by design).
 *
 * Composing: repo-scanner.ts calls checkPresentInAgf() at L282 to upgrade the
 * has.has(cap) decision; ncd-dedup.ts provides the ncd() primitive.
 */

import { ncd } from '../economy/ncd-dedup.js'

// ---------------------------------------------------------------------------
// Bloom filter — bit array over FNV-1a hashes (no false negatives)
// ---------------------------------------------------------------------------

const BLOOM_SIZE = 1 << 14 // 16 384 bits (2 KB)
const BLOOM_HASH_COUNT = 3

function fnv1a(s: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

export interface BloomFilter {
  mightContain(item: string): boolean
}

export function buildBloomFilter(items: string[]): BloomFilter {
  const bits = new Uint8Array(BLOOM_SIZE >> 3)

  function set(item: string): void {
    for (let i = 0; i < BLOOM_HASH_COUNT; i++) {
      const idx = fnv1a(item, i * 2654435761) % BLOOM_SIZE
      bits[idx >> 3] |= 1 << (idx & 7)
    }
  }

  function mightContain(item: string): boolean {
    for (let i = 0; i < BLOOM_HASH_COUNT; i++) {
      const idx = fnv1a(item, i * 2654435761) % BLOOM_SIZE
      if (!(bits[idx >> 3] & (1 << (idx & 7)))) return false
    }
    return true
  }

  for (const item of items) set(item)
  return { mightContain }
}

// ---------------------------------------------------------------------------
// Public types & API
// ---------------------------------------------------------------------------

export interface AgfPresenceChecker {
  /** Exact capability tags agf is known to have (from lexicon + command names). */
  exactTags: Set<string>
  /** Corpus of capability description texts to compare via NCD. */
  corpus: string[]
}

export interface AgfPresenceOptions {
  /** NCD threshold below which a capability is considered present (default 0.85). */
  ncdThreshold?: number
}

/**
 * Returns true if the given capability is already present in agf.
 *
 * Decision order:
 *  1. Exact tag membership (O(1))
 *  2. Bloom pre-filter — if definitely absent, skip NCD
 *  3. NCD comparison against every corpus entry — true if any score < threshold
 */
export function checkPresentInAgf(cap: string, checker: AgfPresenceChecker, opts: AgfPresenceOptions = {}): boolean {
  const threshold = opts.ncdThreshold ?? 0.85

  // Fast path: exact tag match
  if (checker.exactTags.has(cap)) return true

  // NCD against corpus — true if any entry is within threshold
  for (const entry of checker.corpus) {
    if (ncd(cap, entry) < threshold) return true
  }

  return false
}
