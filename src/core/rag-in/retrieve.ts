/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * RAG-IN retrieval — recover the right command for a natural-language intent.
 *
 * Reuses the harness retrieval primitives (does NOT duplicate `search/`):
 * fuses two lexical rankings (intent-BM25 × command/tool-name overlap) with the
 * existing Reciprocal Rank Fusion (`computeRrfScore`). A confidence gate then
 * decides retrieve-vs-fallback: below the threshold it returns an explicit
 * `--help` instruction instead of guessing — the gate is what protects quality
 * and materializes the economy.
 */

import { computeRrfScore } from '../economy/rrf.js'
import type { CommandChunk } from './command-chunk.js'

export interface RetrievedCommand {
  chunk: CommandChunk
  score: number
}

export type RetrieveOutcome = 'retrieved' | 'fallback_help'

export interface RetrieveDecision {
  decision: RetrieveOutcome
  query: string
  /** [0,1] — query-term coverage of the top candidate. */
  confidence: number
  top: CommandChunk | null
  candidates: RetrievedCommand[]
  /** Fallback instruction when below threshold (e.g. `tar --help`), else null. */
  fallback: string | null
}

export interface RetrieveOptions {
  /** Confidence gate; below this → fallback_help. Conservative default. */
  threshold?: number
  /** Top-k candidates to return. */
  k?: number
}

const DEFAULT_THRESHOLD = 0.5
const DEFAULT_K = 3
const BM25_K1 = 1.5
const BM25_B = 0.75

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'to',
  'of',
  'in',
  'on',
  'for',
  'and',
  'or',
  'with',
  'into',
  'um',
  'uma',
  'o',
  'os',
  'as',
  'de',
  'da',
  'do',
  'em',
  'no',
  'na',
  'para',
  'e',
  'que',
  'com',
  'inside',
  'from',
])

function tokenize(text: string): string[] {
  // Split on any non-alphanumeric (including dots) so "tar.gz" → ["tar","gz"]
  // and matches the tool token "tar" — found via dogfooding the tar.gz query.
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)
}

/** Content tokens of a query (stopwords removed) used for coverage scoring. */
function contentTokens(text: string): string[] {
  return tokenize(text).filter((t) => !STOPWORDS.has(t))
}

function docText(c: CommandChunk): string {
  return `${c.intent} ${c.command} ${c.tool}`
}

/** Standard BM25 over the corpus; returns score per chunk index. */
function bm25Scores(queryTokens: string[], docs: string[][]): number[] {
  const N = docs.length
  if (N === 0) return []
  const avgdl = docs.reduce((s, d) => s + d.length, 0) / N
  const df = new Map<string, number>()
  for (const d of docs) {
    for (const term of new Set(d)) df.set(term, (df.get(term) ?? 0) + 1)
  }
  return docs.map((d) => {
    const tf = new Map<string, number>()
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1)
    let score = 0
    for (const q of queryTokens) {
      const f = tf.get(q) ?? 0
      if (f === 0) continue
      const n = df.get(q) ?? 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      const denom = f + BM25_K1 * (1 - BM25_B + (BM25_B * d.length) / avgdl)
      score += idf * ((f * (BM25_K1 + 1)) / denom)
    }
    return score
  })
}

/** 1-based ranks from a score array (descending); ties broken by index. */
function ranksFromScores(scores: number[]): number[] {
  const order = scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s || a.i - b.i)
  const rank = new Array<number>(scores.length).fill(0)
  order.forEach((o, idx) => {
    // rank 0 means "absent" in RRF; only rank positive contributors
    rank[o.i] = o.s > 0 ? idx + 1 : 0
  })
  return rank
}

/**
 * TF-IDF cosine similarity between a query and each document's tokens.
 *
 * Used as the "intent embedding" signal: captures term-overlap semantics on
 * the `intent` field (e.g. "file" shared between "search for a pattern in a
 * file" and "find text in file"). Direction-based; complements BM25 frequency
 * weighting. Exported for unit testing.
 */
export function tfidfCosineScores(queryTokens: string[], docTokens: string[][]): number[] {
  const N = docTokens.length
  if (N === 0 || queryTokens.length === 0) return docTokens.map(() => 0)

  // Build corpus document frequency
  const df = new Map<string, number>()
  for (const d of docTokens) {
    for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1)
  }
  const idf = (t: string) => Math.log(1 + (N + 1) / ((df.get(t) ?? 0) + 1))

  // Query TF-IDF vector (only over query terms)
  const qTf = new Map<string, number>()
  for (const t of queryTokens) qTf.set(t, (qTf.get(t) ?? 0) + 1)
  const qVec = new Map<string, number>()
  for (const [t, f] of qTf) qVec.set(t, f * idf(t))
  const qNorm = Array.from(qVec.values()).reduce((s, w) => s + w * w, 0)

  return docTokens.map((d) => {
    const dTf = new Map<string, number>()
    for (const t of d) dTf.set(t, (dTf.get(t) ?? 0) + 1)
    let dot = 0
    for (const [t, qw] of qVec) {
      const dw = (dTf.get(t) ?? 0) * idf(t)
      dot += qw * dw
    }
    const dNorm = Array.from(dTf.entries()).reduce((s, [t, f]) => {
      const w = f * idf(t)
      return s + w * w
    }, 0)
    const denom = Math.sqrt(qNorm) * Math.sqrt(dNorm)
    return denom === 0 ? 0 : dot / denom
  })
}

/**
 * Cross-encoder reranking: takes a pre-candidate pool and scores each by
 * query-term coverage over both the intent field (primary signal) and the full
 * doc text (secondary). Deterministic; no external dependencies. Exported for
 * unit testing.
 */
export function rerankCandidates(
  query: string,
  candidates: readonly RetrievedCommand[],
  k: number,
): RetrievedCommand[] {
  if (candidates.length === 0) return []
  const qTokens = tokenize(query).filter((t) => !STOPWORDS.has(t))
  if (qTokens.length === 0) return candidates.slice(0, k)

  const scored = candidates.map((r) => {
    const intentTokens = new Set(tokenize(r.chunk.intent))
    const docTokens = new Set(tokenize(docText(r.chunk)))
    const intentCoverage = qTokens.filter((t) => intentTokens.has(t)).length / qTokens.length
    const docCoverage = qTokens.filter((t) => docTokens.has(t)).length / qTokens.length
    return { r, crossScore: 0.6 * intentCoverage + 0.4 * docCoverage }
  })

  return scored
    .sort((a, b) => b.crossScore - a.crossScore || b.r.score - a.r.score)
    .slice(0, k)
    .map((s) => s.r)
}

export function retrieveCommand(
  query: string,
  corpus: readonly CommandChunk[],
  opts: RetrieveOptions = {},
): RetrieveDecision {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD
  const k = opts.k ?? DEFAULT_K

  if (corpus.length === 0) {
    return { decision: 'fallback_help', query, confidence: 0, top: null, candidates: [], fallback: null }
  }

  const qContent = contentTokens(query)
  const qAll = tokenize(query)

  // Ranking 1: BM25 over the full doc text (intent + command + tool).
  const intentScores = bm25Scores(
    qAll,
    corpus.map((c) => tokenize(docText(c))),
  )
  // Ranking 2: TF-IDF cosine on intent field ("embedding") — direction-based semantic overlap.
  const cosineScores = tfidfCosineScores(
    qAll,
    corpus.map((c) => tokenize(c.intent)),
  )
  // Ranking 3: lexical overlap on command/tool name (catches retrieval by command name).
  const nameScores = bm25Scores(
    qAll,
    corpus.map((c) => tokenize(`${c.tool} ${c.command}`)),
  )

  const intentRanks = ranksFromScores(intentScores)
  const cosineRanks = ranksFromScores(cosineScores)
  const nameRanks = ranksFromScores(nameScores)

  // Fuse all three signals via RRF: BM25 full-text, TF-IDF cosine intent, name-overlap.
  const fused = corpus.map((chunk, i) => ({
    chunk,
    score: computeRrfScore(
      { bm25Rank: intentRanks[i], vectorRank: cosineRanks[i], graphRank: nameRanks[i] },
      { k: 60, weights: { bm25: 0.5, vector: 0.3, graph: 0.2 } },
    ),
  }))

  const ranked = fused.filter((r) => r.score > 0).sort((a, b) => b.score - a.score)
  // Cross-encoder rerank: expand pool to top-20 then refine to k.
  const poolSize = Math.min(ranked.length, Math.max(20, k * 7))
  const pool = ranked.slice(0, poolSize)
  const candidates = rerankCandidates(query, pool, k)
  const top = candidates[0]?.chunk ?? null

  // Confidence = fraction of query content terms covered by the top candidate.
  let confidence = 0
  if (top && qContent.length > 0) {
    const topTokens = new Set(tokenize(docText(top)))
    const matched = qContent.filter((t) => topTokens.has(t)).length
    confidence = matched / qContent.length
  }

  if (!top || confidence < threshold) {
    const fallback = top ? `${top.tool} --help` : null
    return { decision: 'fallback_help', query, confidence, top: top ?? null, candidates, fallback }
  }

  return { decision: 'retrieved', query, confidence, top, candidates, fallback: null }
}
