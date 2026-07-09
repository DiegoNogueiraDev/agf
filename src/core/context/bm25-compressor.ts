/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * BM25 Compressor — filters text chunks by relevance before consuming token budget.
 * Uses BM25 scoring to rank chunks and discard low-relevance ones.
 *
 * BM25 parameters (tuned for PRD/code content per arXiv 2024-2026 research):
 * - k1=1.8 (higher saturation → boosts rare technical terms in PRD/code)
 * - b=0.75 (standard length normalization)
 *
 * Parameters are configurable via BM25_CONFIG for domain-specific tuning.
 */

import { estimateTokens } from './token-estimator.js'
import { tokenize } from '../search/tokenizer.js'

export interface RankedChunk {
  content: string
  score: number
  tokens: number
}

export interface Bm25Config {
  /** Term frequency saturation parameter. Higher = more weight to rare terms. Default: 1.8 */
  k1: number
  /** Length normalization parameter. 0 = no normalization, 1 = full normalization. Default: 0.75 */
  b: number
  /** BM25+ delta parameter. Boosts short document scoring. 0 = standard BM25. Default: 1.0 */
  delta: number
}

/** Default BM25 parameters, tuned for PRD/code content. */
/** Default BM25 parameters tuned for PRD/code content. */
export const BM25_DEFAULTS: Readonly<Bm25Config> = { k1: 1.8, b: 0.75, delta: 1.0 }

/** Module-level config — can be overridden for domain tuning. */
let activeBm25Config: Bm25Config = { ...BM25_DEFAULTS }

/** Override BM25 parameters globally. */
export function setBm25Config(config: Partial<Bm25Config>): void {
  activeBm25Config = { ...activeBm25Config, ...config }
}

/** Reset BM25 parameters to defaults. */
export function resetBm25Config(): void {
  activeBm25Config = { ...BM25_DEFAULTS }
}

/** Get current BM25 config. */
export function getBm25Config(): Readonly<Bm25Config> {
  return { ...activeBm25Config }
}

/**
 * Tokenize text for BM25 — delegates to unified tokenizer.
 * BM25 needs raw tokens without stopword removal or accent stripping
 * to preserve term frequency accuracy.
 */
function bm25Tokenize(text: string): string[] {
  return tokenize(text, { stopwords: false, accentStrip: false })
}

/**
 * Score and rank text chunks by BM25 relevance to a query.
 * Returns chunks sorted by score (descending).
 */
export function rankChunksByBm25(chunks: string[], query: string): RankedChunk[] {
  if (chunks.length === 0 || !query.trim()) return []

  const queryTerms = bm25Tokenize(query)
  if (queryTerms.length === 0) {
    return chunks.map((c) => ({ content: c, score: 0, tokens: estimateTokens(c) }))
  }

  // Compute document frequencies
  const tokenizedChunks = chunks.map(bm25Tokenize)
  const docFreq = new Map<string, number>()
  const totalDocs = chunks.length

  for (const tokens of tokenizedChunks) {
    const unique = new Set(tokens)
    for (const term of unique) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1)
    }
  }

  // Average document length (Bug #060: guard against zero to prevent NaN)
  const totalTokens = tokenizedChunks.reduce((sum, t) => sum + t.length, 0)
  // E3-T01: when all chunks are empty (totalTokens=0), return empty — no meaningful ranking
  if (totalTokens === 0) return []
  const avgDl = totalTokens / totalDocs

  // Score each chunk
  const ranked: RankedChunk[] = chunks.map((chunk, i) => {
    const tokens = tokenizedChunks[i]
    const dl = tokens.length
    let score = 0

    // Term frequency map
    const tf = new Map<string, number>()
    for (const tVar of tokens) {
      tf.set(tVar, (tf.get(tVar) ?? 0) + 1)
    }

    for (const term of queryTerms) {
      const termTf = tf.get(term) ?? 0
      if (termTf === 0) continue

      const df = docFreq.get(term) ?? 0
      const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1)
      const { k1, b, delta } = activeBm25Config
      const tfNorm = (termTf * (k1 + 1)) / (termTf + k1 * (1 - b + b * (dl / avgDl))) + delta

      score += idf * tfNorm
    }

    return {
      content: chunk,
      score,
      tokens: estimateTokens(chunk),
    }
  })

  // Sort by score descending
  ranked.sort((a, b) => b.score - a.score)
  return ranked
}

/**
 * Select top chunks within a token budget, ranked by BM25 relevance.
 */
export function compressWithBm25(chunks: string[], query: string, tokenBudget: number): RankedChunk[] {
  const ranked = rankChunksByBm25(chunks, query)
  const selected: RankedChunk[] = []
  let tokensUsed = 0

  for (const chunk of ranked) {
    // Bug #059: respect budget even for the first chunk
    if (tokensUsed + chunk.tokens > tokenBudget) break
    selected.push(chunk)
    tokensUsed += chunk.tokens
  }

  return selected
}
