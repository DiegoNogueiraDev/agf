/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * MemGPT-style tiered archival memory — long-term context persistence.
 *
 * WHY this module exists: MemGPT (Packer et al., 2023) frames an LLM's memory as
 * a hierarchy — a small, fast *main context* (hot) backed by an unbounded
 * *external context* (warm + cold) that the system pages in and out on demand.
 * This module is the thin, deterministic facade that unifies the three stores
 * agent-graph-flow already owns into that hierarchy, so a session can run
 * arbitrarily long without the token cost growing unboundedly:
 *
 *   - hot  → current-session flow blocks (src/core/context/flow-compact.ts)
 *   - warm → episodic outcomes           (src/core/store/episodic-outcomes-store.ts)
 *   - cold → archival file memories       (src/core/memory/memory-reader.ts)
 *
 * It adds NO new storage: it reuses the existing stores and the existing
 * snippet/relevance helpers (DRY). The pure core ({@link rankTieredMemories},
 * {@link shouldPageOut}, {@link pageOutSummary}) is fully testable without I/O;
 * {@link searchAllTiers} is the async orchestrator that wires the real stores.
 * §ADR-deterministic-first — zero LLM calls; paging summaries are deterministic.
 */

import type Database from 'better-sqlite3'
import { buildMemorySnippet, readAllMemories } from './memory-reader.js'
import { queryEpisodicOutcomes } from '../store/episodic-outcomes-store.js'

/** The three rungs of the MemGPT memory hierarchy. */
export type MemoryTier = 'hot' | 'warm' | 'cold'

/** A raw, untiered-but-tagged piece of recallable text fed to the ranker. */
export interface TierCandidate {
  tier: MemoryTier
  id: string
  text: string
}

/** A ranked recall hit, carrying its originating tier for transparency. */
export interface TierSearchResult {
  tier: MemoryTier
  id: string
  snippet: string
  /** Tier-weighted relevance; higher is more relevant. */
  score: number
}

/** Where {@link searchAllTiers} pulls each tier from (all optional). */
export interface TierSources {
  /** Pre-supplied current-session blocks (the live, in-memory hot tier). */
  hotBlocks?: TierCandidate[]
  /** Open DB handle for the warm tier (`episodic_outcomes`). */
  db?: Database.Database
  /** Project dir for the cold tier (file memories under workflow-graph/memories). */
  basePath?: string
}

/** Tuning knobs for ranking. */
export interface TierSearchOptions {
  limit?: number
  weights?: Record<MemoryTier, number>
}

/**
 * Default tier weights. Recency matters: a hit in the live session (hot) outranks
 * an equally-relevant episodic outcome (warm), which outranks a cold archive hit.
 */
export const DEFAULT_TIER_WEIGHTS: Record<MemoryTier, number> = {
  hot: 1,
  warm: 0.8,
  cold: 0.6,
}

/** Default number of warm/cold candidates pulled per tier before ranking. */
const TIER_FETCH_LIMIT = 200

/** Count occurrences of `q` (lowercased) inside `haystackLower`. */
function countOccurrences(haystackLower: string, q: string): number {
  if (q.length === 0) return 0
  let count = 0
  let idx = -1
  while ((idx = haystackLower.indexOf(q, idx + 1)) !== -1) count++
  return count
}

/**
 * Rank candidates across all tiers by tier-weighted term-frequency relevance.
 *
 * Relevance mirrors {@link searchMemories}' length-normalized term frequency
 * (occurrences × 100 ÷ text length) so cross-tier scores are comparable, then
 * scales by the tier weight. Zero-occurrence candidates are dropped. Pure — no I/O.
 */
export function rankTieredMemories(
  query: string,
  candidates: readonly TierCandidate[],
  opts: TierSearchOptions = {},
): TierSearchResult[] {
  const q = query.toLowerCase()
  if (q.length === 0) return []
  const weights = opts.weights ?? DEFAULT_TIER_WEIGHTS
  const limit = opts.limit ?? 10

  const scored: TierSearchResult[] = []
  for (const cand of candidates) {
    const lower = cand.text.toLowerCase()
    const occurrences = countOccurrences(lower, q)
    if (occurrences === 0) continue

    const relevance = (occurrences * 100) / Math.max(cand.text.length, 1)
    const score = relevance * (weights[cand.tier] ?? 0)
    const snippet = buildMemorySnippet(cand.text, lower.indexOf(q), q.length)
    scored.push({ tier: cand.tier, id: cand.id, snippet, score })
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}

/**
 * Decide whether the hot tier must be paged out: true once the live block count
 * exceeds the configured history window (cfg.historyWindow). The overflow is the
 * oldest `hotCount - window` blocks.
 */
export function shouldPageOut(hotCount: number, historyWindow: number): boolean {
  return hotCount > historyWindow
}

/**
 * Deterministically summarize overflow blocks for archival to the cold tier.
 * Uses the first non-empty line of each block as its digest — no LLM, fully
 * reproducible (§ADR-deterministic-first). Returns '' when there is no overflow.
 */
export function pageOutSummary(overflow: readonly TierCandidate[]): string {
  if (overflow.length === 0) return ''
  return overflow
    .map((b) => {
      const firstLine = b.text.split('\n').find((l) => l.trim().length > 0) ?? ''
      return `- ${firstLine.trim()}`
    })
    .join('\n')
}

/**
 * Orchestrated recall: gather candidates from every available tier and return a
 * single relevance-ranked list. Missing sources are skipped, so callers can
 * recall from warm + cold alone (e.g. between sessions) or include the live hot
 * tier. This is what `agf memory search --tiers` calls.
 */
export async function searchAllTiers(
  query: string,
  sources: TierSources,
  opts: TierSearchOptions = {},
): Promise<TierSearchResult[]> {
  const candidates: TierCandidate[] = []

  // hot — live session blocks supplied by the caller
  if (sources.hotBlocks) candidates.push(...sources.hotBlocks)

  // warm — episodic outcomes (approach summary + tags carry the searchable text)
  if (sources.db) {
    const outcomes = queryEpisodicOutcomes(sources.db, { limit: TIER_FETCH_LIMIT })
    for (const o of outcomes) {
      candidates.push({ tier: 'warm', id: o.nodeId, text: `${o.approachSummary} ${o.tags}`.trim() })
    }
  }

  // cold — archival file memories (includes pheromone trails written as files)
  if (sources.basePath) {
    const memories = await readAllMemories(sources.basePath)
    for (const m of memories) {
      candidates.push({ tier: 'cold', id: m.name, text: m.content })
    }
  }

  return rankTieredMemories(query, candidates, opts)
}
