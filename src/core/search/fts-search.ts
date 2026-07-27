/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import type { GraphNode } from '../graph/graph-types.js'
import { createLogger } from '../utils/logger.js'
import { deterministicRank } from './deterministic-ranker.js'
import { rerankWithTfIdf } from './tfidf.js'

const log = createLogger({ layer: 'core', source: 'fts-search.ts' })

export interface SearchResult {
  node: GraphNode
  score: number
}

export interface SearchOptions {
  limit?: number
  rerank?: boolean
  /** Enable fuzzy fallback when FTS5 returns zero results (default: false) */
  fuzzy?: boolean
  /** Fuzzy match threshold 0-1 — lower = more permissive (default: 0.6) */
  fuzzyThreshold?: number
}

/**
 * Sanitize user query for FTS5 — escape special characters and
 * convert spaces to implicit AND (FTS5 default).
 */
function sanitizeFtsQuery(raw: string): string {
  // Remove FTS5 special operators that could cause syntax errors
  const cleaned = raw
    .replace(/[*"(){}[\]:^~!@#$%&|\\]/g, ' ')
    .replace(/\b(AND|OR|NOT|NEAR)\b/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ')

  if (!cleaned) return '""'

  // Wrap each term in double quotes for exact matching, join with space (implicit AND)
  const terms = cleaned.split(' ').filter(Boolean)
  return terms.map((t) => `"${t}"`).join(' ')
}

/**
 * Search nodes using FTS5 full-text search with BM25 ranking.
 * Optionally applies TF-IDF reranking for better relevance.
 */
/**
 * Levenshtein edit distance — used for fuzzy fallback.
 * O(n*m) time, O(min(n,m)) space via single-row optimization.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  // Ensure a is the shorter string for memory optimization
  if (a.length > b.length) [a, b] = [b, a]

  const aLen = a.length
  const bLen = b.length
  let prev = Array.from({ length: aLen + 1 }, (_, i) => i)
  const curr = new Array(aLen + 1)

  for (let j = 1; j <= bLen; j++) {
    curr[0] = j
    for (let i = 1; i <= aLen; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[i] = Math.min(
        prev[i] + 1, // deletion
        curr[i - 1] + 1, // insertion
        prev[i - 1] + cost, // substitution
      )
    }
    prev = [...curr]
  }

  return curr[aLen]
}

/**
 * Fuzzy search fallback — finds nodes by Levenshtein distance on title words.
 * Only used when FTS5 returns zero results.
 */
function fuzzyFallback(store: SqliteStore, query: string, limit: number, threshold: number): SearchResult[] {
  const queryLower = query.toLowerCase()
  const queryTerms = queryLower.split(/\s+/).filter((t) => t.length >= 2)
  if (queryTerms.length === 0) return []

  // Get all nodes for fuzzy matching
  const allNodes = store.getAllNodes()
  const scored: SearchResult[] = []

  for (const node of allNodes) {
    const titleLower = (node.title ?? '').toLowerCase()
    const descLower = (node.description ?? '').toLowerCase()
    const text = `${titleLower} ${descLower}`
    const textWords = text.split(/\s+/).filter((w) => w.length >= 2)

    let totalScore = 0
    let matchedTerms = 0

    for (const term of queryTerms) {
      let bestScore = 0
      for (const word of textWords) {
        const maxLen = Math.max(term.length, word.length)
        if (maxLen === 0) continue
        const dist = levenshtein(term, word)
        const similarity = 1 - dist / maxLen
        if (similarity > bestScore) bestScore = similarity
      }
      if (bestScore >= threshold) {
        totalScore += bestScore
        matchedTerms++
      }
    }

    if (matchedTerms > 0) {
      const avgScore = totalScore / queryTerms.length
      scored.push({ node: node as GraphNode, score: avgScore })
    }
  }

  const rankable = scored.map((r) => ({ ...r, id: r.node.id }))
  return deterministicRank(rankable)
    .map(({ id: _id, ...rest }) => rest as SearchResult)
    .slice(0, limit)
}

/** Search nodes via FTS5 with optional TF-IDF reranking. */
export function searchNodes(store: SqliteStore, query: string, options: SearchOptions = {}): SearchResult[] {
  const { limit = 20, rerank = false, fuzzy = false, fuzzyThreshold = 0.6 } = options
  const sanitized = sanitizeFtsQuery(query)
  log.debug('FTS search start', { query, sanitized, rerank })

  // Bug #063: if sanitization produces empty query (e.g. query="*"), return empty early
  if (sanitized === '""') {
    log.info('FTS search: query sanitized to empty', { originalQuery: query })
    return []
  }

  // Stage 1: FTS5 candidates (fetch extra for reranking)
  const startMs = performance.now()
  const candidateLimit = rerank ? Math.min(limit * 3, 100) : limit
  const ftsResults = store.searchNodes(sanitized, candidateLimit)
  log.debug('FTS search complete', {
    resultCount: ftsResults.length,
    durationMs: Math.round(performance.now() - startMs),
  })

  // Fuzzy fallback: when FTS5 returns nothing and fuzzy is enabled
  if (ftsResults.length === 0 && fuzzy) {
    log.debug('FTS returned 0 results, trying fuzzy fallback', { query })
    return fuzzyFallback(store, query, limit, fuzzyThreshold)
  }

  // Bug #099: skip resultMap construction when rerank is disabled
  if (!rerank || ftsResults.length === 0) {
    return ftsResults.map((r) => {
      const { score, ...node } = r
      return { node: node as GraphNode, score }
    })
  }

  // Stage 2: TF-IDF reranking — build lookup map only when needed
  const resultMap = new Map<string, GraphNode>()
  for (const rVar of ftsResults) {
    const { score: _score, ...node } = rVar
    resultMap.set(node.id, node as GraphNode)
  }

  const candidates = ftsResults.map((r) => ({
    id: r.id,
    text: [r.title, r.description ?? '', (r as unknown as { tags?: string[] }).tags?.join(' ') ?? ''].join(' '),
  }))

  const reranked = rerankWithTfIdf(candidates, query, limit)

  return reranked
    .map((r) => {
      const node = resultMap.get(r.id)
      if (!node) return null
      return { node, score: r.score }
    })
    .filter((r): r is SearchResult => r !== null)
}
