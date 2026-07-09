/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * NCD dedup — drop near-duplicate retrieved chunks by Normalized Compression Distance.
 *
 * Anchor: Kolmogorov complexity / algorithmic information (Li & Vitányi; Cilibrasi &
 * Vitányi 2005). `NCD(a,b) = (C(ab) − min(C(a),C(b))) / max(C(a),C(b))` with `C` = gzip
 * size approximates similarity with **zero embeddings** — a deterministic, local
 * complement to the embedding-based SemanticCache. Cognitive echo: neural habituation /
 * repetition suppression (the brain spends less signaling redundant input).
 *
 * Pure & deterministic (gzip is deterministic). `node:zlib` only — no new deps.
 */

import { gzipSync } from 'node:zlib'

/** Compressed size (bytes) of a string under deterministic gzip. */
function compressedSize(text: string): number {
  return gzipSync(Buffer.from(text, 'utf-8'), { level: 9 }).length
}

/**
 * Normalized Compression Distance in [0, ~1]: 0 ⇒ identical, →1 ⇒ unrelated.
 * Identical inputs short-circuit to 0 (avoids gzip-overhead noise on tiny strings).
 */
export function ncd(a: string, b: string): number {
  if (a === b) return 0
  const ca = compressedSize(a)
  const cb = compressedSize(b)
  const cab = compressedSize(a + b)
  const max = Math.max(ca, cb)
  if (max === 0) return 0
  return Math.max(0, (cab - Math.min(ca, cb)) / max)
}

export interface DedupeOptions {
  /** Drop a chunk when its NCD to an already-kept chunk is below this. Default 0.3. */
  threshold?: number
}

export interface DedupeResult {
  /** The retained, mutually-distinct chunks (input order). */
  kept: string[]
  /** Indices (into the input) of chunks dropped as near-duplicates. */
  droppedIndices: number[]
}

/**
 * Greedily keep chunks, dropping any whose NCD to an already-kept chunk falls below
 * `threshold` (near-duplicate). Deterministic; preserves input order.
 */
export function dedupeByNCD(chunks: string[], opts: DedupeOptions = {}): DedupeResult {
  const threshold = opts.threshold ?? 0.3
  const kept: string[] = []
  const droppedIndices: number[] = []

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const isDup = kept.some((k) => ncd(k, chunk) < threshold)
    if (isDup) droppedIndices.push(i)
    else kept.push(chunk)
  }

  return { kept, droppedIndices }
}
