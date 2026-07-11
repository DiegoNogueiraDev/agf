/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_9ce4e91064e0 — ExternalSearchPort (DIP) com 1-2 provedores
 *
 * AC1: Given query + FetchLike stub returning results from 2 providers,
 *      When port runs, Then returns normalized {title,url,snippet,source} from both.
 * AC2: Given one provider fails, When port runs, Then degrades to remaining (no throw).
 */

import { describe, it, expect } from 'vitest'
import type { FetchLike, SearchResult, ExternalSearchPort } from '../core/search/external-search-port.js'
import { createExaAdapter, createTavilyAdapter, createExternalSearchPort } from '../core/search/external-search-port.js'

// ── Stubs ──────────────────────────────────────────────────────────────────────

function makeExaFetch(results: object[]): FetchLike {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ results }),
    text: async () => JSON.stringify({ results }),
  })
}

function makeTavilyFetch(results: object[]): FetchLike {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ results }),
    text: async () => JSON.stringify({ results }),
  })
}

function makeFailingFetch(): FetchLike {
  return async () => {
    throw new Error('Network error')
  }
}

const EXA_RESULTS = [
  { title: 'Exa Result 1', url: 'https://exa.ai/1', text: 'Exa snippet 1' },
  { title: 'Exa Result 2', url: 'https://exa.ai/2', text: 'Exa snippet 2' },
]

const TAVILY_RESULTS = [
  { title: 'Tavily Result 1', url: 'https://tavily.com/1', content: 'Tavily snippet 1' },
  { title: 'Tavily Result 2', url: 'https://tavily.com/2', content: 'Tavily snippet 2' },
]

// ── AC1 — normalized results from both providers ───────────────────────────────

describe('ExternalSearchPort (AC1 — both providers succeed)', () => {
  it('returns an array of SearchResult objects', async () => {
    const port = createExternalSearchPort([
      createExaAdapter({ fetchFn: makeExaFetch(EXA_RESULTS), apiKey: 'test-key' }),
      createTavilyAdapter({ fetchFn: makeTavilyFetch(TAVILY_RESULTS), apiKey: 'test-key' }),
    ])
    const results = await port.search('test query')
    expect(Array.isArray(results)).toBe(true)
    expect(results.length).toBeGreaterThan(0)
  })

  it('each result has title, url, snippet, source fields', async () => {
    const port = createExternalSearchPort([
      createExaAdapter({ fetchFn: makeExaFetch(EXA_RESULTS), apiKey: 'test-key' }),
    ])
    const results = await port.search('test query')
    for (const r of results) {
      expect(typeof r.title).toBe('string')
      expect(typeof r.url).toBe('string')
      expect(typeof r.snippet).toBe('string')
      expect(typeof r.source).toBe('string')
    }
  })

  it('source field identifies the provider', async () => {
    const port = createExternalSearchPort([
      createExaAdapter({ fetchFn: makeExaFetch(EXA_RESULTS), apiKey: 'test-key' }),
      createTavilyAdapter({ fetchFn: makeTavilyFetch(TAVILY_RESULTS), apiKey: 'test-key' }),
    ])
    const results = await port.search('test query')
    const sources = results.map((r) => r.source)
    expect(sources.some((s) => s === 'exa')).toBe(true)
    expect(sources.some((s) => s === 'tavily')).toBe(true)
  })

  it('returns results from both providers combined', async () => {
    const port = createExternalSearchPort([
      createExaAdapter({ fetchFn: makeExaFetch(EXA_RESULTS), apiKey: 'test-key' }),
      createTavilyAdapter({ fetchFn: makeTavilyFetch(TAVILY_RESULTS), apiKey: 'test-key' }),
    ])
    const results = await port.search('test query')
    expect(results.length).toBeGreaterThanOrEqual(4)
  })
})

// ── AC2 — graceful degradation when one provider fails ────────────────────────

describe('ExternalSearchPort (AC2 — one provider fails)', () => {
  it('does not throw when one provider fails', async () => {
    const port = createExternalSearchPort([
      createExaAdapter({ fetchFn: makeFailingFetch(), apiKey: 'test-key' }),
      createTavilyAdapter({ fetchFn: makeTavilyFetch(TAVILY_RESULTS), apiKey: 'test-key' }),
    ])
    await expect(port.search('test query')).resolves.not.toThrow()
  })

  it('returns results from the working provider when one fails', async () => {
    const port = createExternalSearchPort([
      createExaAdapter({ fetchFn: makeFailingFetch(), apiKey: 'test-key' }),
      createTavilyAdapter({ fetchFn: makeTavilyFetch(TAVILY_RESULTS), apiKey: 'test-key' }),
    ])
    const results = await port.search('test query')
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.source === 'tavily')).toBe(true)
  })

  it('returns empty array when all providers fail', async () => {
    const port = createExternalSearchPort([
      createExaAdapter({ fetchFn: makeFailingFetch(), apiKey: 'test-key' }),
      createTavilyAdapter({ fetchFn: makeFailingFetch(), apiKey: 'test-key' }),
    ])
    const results = await port.search('test query')
    expect(results).toEqual([])
  })
})

// Type shape check
const _typeCheck: SearchResult = { title: 'T', url: 'U', snippet: 'S', source: 'exa' }
const _portCheck: ExternalSearchPort = { search: async () => [] }
void _typeCheck
void _portCheck
