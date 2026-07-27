/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Lightweight TF-IDF implementation for two-stage search reranking.
 * No external dependencies — pure TypeScript.
 *
 * Supports vocabulary caching with lazy invalidation:
 * - docFreq is built incrementally as documents are added
 * - invalidate() flags for lazy rebuild on next query
 */

import { tokenize } from './tokenizer.js'

interface DocumentEntry {
  id: string
  tokens: string[]
  termFreq: Map<string, number>
}

export class TfIdfIndex {
  private docs: DocumentEntry[] = []
  private docFreq: Map<string, number> = new Map()
  private dirty = false

  /**
   * Add a document to the index.
   * Incrementally updates docFreq (no full rebuild needed).
   */
  addDocument(id: string, text: string): void {
    const tokens = tokenize(text)
    const termFreq = new Map<string, number>()

    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) ?? 0) + 1)
    }

    // Update document frequency incrementally
    for (const term of termFreq.keys()) {
      this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1)
    }

    this.docs.push({ id, tokens, termFreq })
  }

  /**
   * Flag the index for lazy rebuild on next query.
   * Does NOT rebuild immediately — just sets a flag.
   * Call this when the underlying corpus changes (knowledge store insert/update/delete).
   */
  invalidate(): void {
    this.dirty = true
  }

  /**
   * Rebuild docFreq from scratch if invalidated.
   * Called lazily on next search() after invalidate().
   */
  private rebuildIfDirty(): void {
    if (!this.dirty) return

    this.docFreq.clear()
    for (const doc of this.docs) {
      for (const term of doc.termFreq.keys()) {
        this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1)
      }
    }
    this.dirty = false
  }

  /**
   * Compute TF-IDF score for a query against all documents.
   * Returns sorted results (highest score first).
   * Lazily rebuilds docFreq if invalidated.
   */
  search(query: string, limit: number = 20): Array<{ id: string; score: number }> {
    this.rebuildIfDirty()

    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) return []

    const nVar = this.docs.length
    if (nVar === 0) return []

    const results: Array<{ id: string; score: number }> = []

    for (const doc of this.docs) {
      let score = 0
      const docLen = doc.tokens.length || 1

      for (const qt of queryTokens) {
        const tf = (doc.termFreq.get(qt) ?? 0) / docLen
        const df = this.docFreq.get(qt) ?? 0
        if (df === 0) continue

        // IDF with smoothing: log(1 + N/df)
        const idf = Math.log(1 + nVar / df)
        score += tf * idf
      }

      if (score > 0) {
        results.push({ id: doc.id, score })
      }
    }

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit)
  }
}

/**
 * Build a TF-IDF index from search result nodes and rerank them.
 * Two-stage: FTS5 candidates → TF-IDF reranking.
 */
/** Build a TF-IDF index from candidates and rerank by query. */
export function rerankWithTfIdf(
  candidates: Array<{ id: string; text: string }>,
  query: string,
  limit: number = 20,
): Array<{ id: string; score: number }> {
  const index = new TfIdfIndex()
  for (const cVar of candidates) {
    index.addDocument(cVar.id, cVar.text)
  }
  return index.search(query, limit)
}
