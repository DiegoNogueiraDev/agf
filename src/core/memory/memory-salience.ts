/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Memory salience — ACT-R / Ebbinghaus base-level activation for ranking project
 * memories before injection (token-economy lever `memory_salience`).
 *
 * Biological anchor: human declarative memory forgets on a power law (Ebbinghaus);
 * Anderson & Schooler (1991) showed retrievability is rationally tuned to recency
 * AND frequency of use — base-level activation `B = ln(Σ t_k^{-d})`. Ranking by
 * activation (instead of raw occurrence count) injects fewer, higher-value memories.
 *
 * Pure & deterministic — no I/O. The file-reading wiring lives in `memory-reader.ts`.
 */

import type { MemorySearchResult } from './memory-reader.js'

/** ACT-R canonical base-level decay rate. */
export const DEFAULT_DECAY = 0.5
/** Weight of the spreading-activation (query↔content overlap) term. */
export const DEFAULT_SPREADING_WEIGHT = 1

export interface ActivationOptions {
  /** Base-level decay rate `d` (larger ⇒ age punished harder). Default {@link DEFAULT_DECAY}. */
  decay?: number
  /** Weight of the spreading-activation term. Default {@link DEFAULT_SPREADING_WEIGHT}. */
  spreadingWeight?: number
}

/** A memory paired with its computed activation and its injection token cost. */
export interface ScoredMemory {
  result: MemorySearchResult
  activation: number
  tokens: number
}

export interface SelectionOptions {
  /** Maximum number of memories to keep. */
  limit: number
  /** Absolute floor: drop memories whose activation is below this. Default `-Infinity` (keep top-N). */
  threshold?: number
  /**
   * Relative floor: drop memories whose activation is more than this far below the best one.
   * Robust to the absolute (seconds-scale, usually negative) base-level magnitude — a memory
   * `relativeThreshold` nats below the strongest is effectively unretrievable. Default `Infinity` (off).
   */
  relativeThreshold?: number
  /** Current time in ms (default: Date.now()). Injected for deterministic tests. */
  nowMs?: number
  /**
   * Total corpus size — used to detect brute-force retrieval (>50% of ≥20-item corpus).
   * Omit to skip brute-force detection (backward-compatible).
   */
  corpusSize?: number
}

export interface SelectionResult {
  /** Kept memories, highest activation first, capped at `limit`. */
  kept: MemorySearchResult[]
  /** Tokens of the memories dropped by the threshold or the limit (the saving). */
  droppedTokens: number
  /**
   * Set to `'index-brute-force'` when the recall selected >50% of a corpus ≥20.
   * Indicates the caller should consider a proper index instead of a full scan.
   * Undefined when not triggered (backward-compatible).
   */
  warning?: 'index-brute-force'
}

// ---------------------------------------------------------------------------
// Index-honesty / brute-force detection
// ---------------------------------------------------------------------------

const BRUTE_FORCE_CORPUS_MIN = 20
const BRUTE_FORCE_RATIO = 0.5

export interface IndexHonestyInput {
  selected: number
  corpusSize: number
}

export interface IndexHonestyResult {
  bruteForce: boolean
}

/**
 * Returns `bruteForce: true` when `selected > 50%` of a corpus of ≥20 items.
 * Small corpora (< 20) are exempt — a full scan is fine at that scale.
 */
export function computeIndexHonesty(input: IndexHonestyInput): IndexHonestyResult {
  if (input.corpusSize < BRUTE_FORCE_CORPUS_MIN) return { bruteForce: false }
  return { bruteForce: input.selected / input.corpusSize > BRUTE_FORCE_RATIO }
}

/**
 * ACT-R base-level activation `B = ln(occurrences) − d·ln(ageSeconds + 1)`.
 * Recent and frequent memories score highest; old or rare ones decay toward (and below) zero.
 */
export function computeBaseLevelActivation(
  input: { occurrences: number; ageMs: number },
  opts: { decay?: number } = {},
): number {
  const d = opts.decay ?? DEFAULT_DECAY
  const occ = Math.max(1, input.occurrences)
  const ageSec = Math.max(0, input.ageMs) / 1000
  return Math.log(occ) - d * Math.log(ageSec + 1)
}

/**
 * Score a single memory for a query: base-level activation (recency × frequency)
 * plus a spreading term (Jaccard overlap of query and content terms).
 * Zero occurrences ⇒ `{ occurrences: 0, activation: -Infinity }` so callers skip it.
 */
export function scoreMemoryActivation(
  input: { content: string; query: string; mtimeMs: number; nowMs: number },
  opts: ActivationOptions = {},
): { occurrences: number; activation: number } {
  const query = input.query.toLowerCase()
  const occurrences = countOccurrences(input.content.toLowerCase(), query)
  if (occurrences === 0) return { occurrences: 0, activation: -Infinity }

  const base = computeBaseLevelActivation({ occurrences, ageMs: input.nowMs - input.mtimeMs }, opts)
  const spread = (opts.spreadingWeight ?? DEFAULT_SPREADING_WEIGHT) * jaccard(terms(input.query), terms(input.content))
  return { occurrences, activation: base + spread }
}

/**
 * Keep the highest-activation memories up to `limit`, dropping anything below `threshold`.
 * Reports the token cost of everything dropped (by threshold or by limit) as the saving.
 */
export function selectByActivation(scored: ScoredMemory[], opts: SelectionOptions): SelectionResult {
  const nowMs = opts.nowMs ?? Date.now()
  // Pre-filter: drop expired memories (valid_until < now) and superseded facts.
  const valid = scored.filter((s) => {
    if (s.result.supersededBy != null) return false
    const vu = s.result.validUntil
    if (vu == null) return true
    return new Date(vu).getTime() >= nowMs
  })

  const ranked = [...valid].sort((a, b) => b.activation - a.activation)
  const best = ranked[0]?.activation ?? -Infinity
  const relativeFloor =
    opts.relativeThreshold !== undefined && Number.isFinite(best) ? best - opts.relativeThreshold : -Infinity
  const floor = Math.max(opts.threshold ?? -Infinity, relativeFloor)

  // Account for dropped-by-expiry tokens in the saving report
  const expiredTokens = scored.reduce((sum, s) => {
    const vu = s.result.validUntil
    if (vu == null) return sum
    return new Date(vu).getTime() < nowMs ? sum + s.tokens : sum
  }, 0)

  const kept: MemorySearchResult[] = []
  let droppedTokens = expiredTokens

  for (let i = 0; i < ranked.length; i++) {
    const entry = ranked[i]
    if (kept.length < opts.limit && entry.activation >= floor) {
      kept.push(entry.result)
    } else {
      droppedTokens += entry.tokens
    }
  }

  const honesty =
    opts.corpusSize !== undefined
      ? computeIndexHonesty({ selected: kept.length, corpusSize: opts.corpusSize })
      : { bruteForce: false }

  return {
    kept,
    droppedTokens,
    ...(honesty.bruteForce ? { warning: 'index-brute-force' as const } : {}),
  }
}

/** Count non-overlapping occurrences of `query` in `haystack` (both already lowercased). */
function countOccurrences(haystack: string, query: string): number {
  if (query.length === 0) return 0
  let count = 0
  let idx = -1
  while ((idx = haystack.indexOf(query, idx + 1)) !== -1) count++
  return count
}

/** Tokenize to a set of lowercased alphanumeric terms (length ≥ 2). */
function terms(text: string): Set<string> {
  const out = new Set<string>()
  for (const m of text.toLowerCase().matchAll(/[a-z0-9]{2,}/g)) out.add(m[0])
  return out
}

/** Jaccard similarity of two term sets — 0 when either is empty. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}
