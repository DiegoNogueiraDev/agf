/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * ExternalSearchPort — DIP abstraction over external web search providers.
 * Adapters: Exa, Tavily. FetchLike injected for testability (no real network in tests).
 * Normalizes all results to {title, url, snippet, source}.
 * Graceful degradation: a failing provider is skipped; others still return results.
 *
 * WHY DIP: core stays pure (no fetch/auth leaking in); adapters live at the boundary.
 * Composing: used by context assembler and RAG pipeline for web-grounded evidence.
 */

import { DEFAULT_RRF_K } from '../economy/rrf.js'

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>

export interface SearchResult {
  title: string
  url: string
  snippet: string
  source: string
}

export interface ExternalSearchPort {
  search(query: string, opts?: { maxResults?: number }): Promise<SearchResult[]>
}

interface ProviderAdapter {
  search(query: string, maxResults: number): Promise<SearchResult[]>
}

// ── Exa adapter ───────────────────────────────────────────────────────────────

interface ExaAdapterOpts {
  fetchFn: FetchLike
  apiKey: string
  /** Default: https://api.exa.ai */
  baseUrl?: string
}

interface ExaResultItem {
  title?: string
  url?: string
  text?: string
}

export function createExaAdapter(opts: ExaAdapterOpts): ProviderAdapter {
  return {
    async search(query, maxResults) {
      const url = `${opts.baseUrl ?? 'https://api.exa.ai'}/search`
      const res = await opts.fetchFn(url, {
        method: 'POST',
        headers: { 'x-api-key': opts.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ query, numResults: maxResults, contents: { text: true } }),
      })
      const data = (await res.json()) as { results?: ExaResultItem[] }
      const items = data.results ?? []
      return items.map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: r.text ?? '',
        source: 'exa',
      }))
    },
  }
}

// ── Tavily adapter ────────────────────────────────────────────────────────────

interface TavilyAdapterOpts {
  fetchFn: FetchLike
  apiKey: string
  /** Default: https://api.tavily.com */
  baseUrl?: string
}

interface TavilyResultItem {
  title?: string
  url?: string
  content?: string
}

export function createTavilyAdapter(opts: TavilyAdapterOpts): ProviderAdapter {
  return {
    async search(query, maxResults) {
      const url = `${opts.baseUrl ?? 'https://api.tavily.com'}/search`
      const res = await opts.fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ api_key: opts.apiKey, query, max_results: maxResults }),
      })
      const data = (await res.json()) as { results?: TavilyResultItem[] }
      const items = data.results ?? []
      return items.map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: r.content ?? '',
        source: 'tavily',
      }))
    },
  }
}

// ── Multi-source merge: dedupe by URL + Reciprocal Rank Fusion ───────────────

/**
 * Merge results from multiple ranked source lists into a single deduplicated list
 * ordered by Reciprocal Rank Fusion score: score = Σ_i 1/(k + rank_i).
 *
 * Canonical entity key: URL (lowercased). When the same URL appears in multiple
 * sources its RRF scores are summed; the first-seen title/snippet is kept.
 * Reuses DEFAULT_RRF_K from src/core/economy/rrf.ts — no reimplementation.
 */
export function mergeWithRrf(sources: SearchResult[][], k = DEFAULT_RRF_K): (SearchResult & { rrfScore: number })[] {
  const scores = new Map<string, number>()
  const canonical = new Map<string, SearchResult>()

  for (const list of sources) {
    for (let rank = 0; rank < list.length; rank++) {
      const item = list[rank]
      const key = item.url.toLowerCase()
      scores.set(key, (scores.get(key) ?? 0) + 1 / (k + rank + 1))
      if (!canonical.has(key)) canonical.set(key, item)
    }
  }

  return [...canonical.entries()]
    .map(([key, item]) => ({ ...item, rrfScore: scores.get(key) ?? 0 }))
    .sort((a, b) => b.rrfScore - a.rrfScore)
}

// ── Port factory ──────────────────────────────────────────────────────────────

/**
 * Creates an ExternalSearchPort that fans out to all adapters and merges results.
 * Failing adapters are silently skipped (graceful degradation).
 */
export function createExternalSearchPort(adapters: ProviderAdapter[]): ExternalSearchPort {
  return {
    async search(query, opts) {
      const maxResults = opts?.maxResults ?? 10
      const settled = await Promise.allSettled(adapters.map((a) => a.search(query, maxResults)))
      const results: SearchResult[] = []
      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') results.push(...outcome.value)
      }
      return results
    },
  }
}
