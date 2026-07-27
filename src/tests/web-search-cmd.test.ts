/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_wire_6fa6f067f504 — wires core/search/external-search-port.ts (dormant,
 * no-surface) into the CLI as `agf web-search`.
 *
 * AC1: Given no EXA_API_KEY/TAVILY_API_KEY set, when buildAdaptersFromEnv runs,
 *      Then it returns an empty adapter list (command surfaces NO_PROVIDER_KEY).
 * AC2: Given a stubbed FetchLike returning results for exa+tavily, when
 *      runWebSearch merges them, Then output is deduped by URL and RRF-ranked
 *      descending.
 * AC3: Given one provider's fetch rejects, when runWebSearch runs, Then it
 *      degrades gracefully and still returns the working provider's results.
 */

import { describe, it, expect } from 'vitest'
import type { FetchLike } from '../core/search/external-search-port.js'
import { createExaAdapter, createTavilyAdapter } from '../core/search/external-search-port.js'
import { buildAdaptersFromEnv, runWebSearch } from '../cli/commands/web-search-cmd.js'

function makeFetch(results: object[]): FetchLike {
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

describe('buildAdaptersFromEnv (AC1)', () => {
  it('returns no adapters when no provider API keys are set', () => {
    const adapters = buildAdaptersFromEnv({}, makeFetch([]))
    expect(adapters).toEqual([])
  })

  it('returns one adapter per configured provider key', () => {
    const adapters = buildAdaptersFromEnv({ EXA_API_KEY: 'k1', TAVILY_API_KEY: 'k2' }, makeFetch([]))
    expect(adapters.length).toBe(2)
  })
})

describe('runWebSearch (AC2 — dedup + RRF ranking)', () => {
  it('dedupes results sharing a URL across providers and ranks by RRF score', async () => {
    const shared = { title: 'Shared', url: 'https://example.com/a', text: 'from exa', content: 'from tavily' }
    const adapters = [
      createExaAdapter({ fetchFn: makeFetch([shared]), apiKey: 'k' }),
      createTavilyAdapter({ fetchFn: makeFetch([shared]), apiKey: 'k' }),
    ]
    const results = await runWebSearch(adapters, 'query', 10)
    const matches = results.filter((r) => r.url === 'https://example.com/a')
    expect(matches.length).toBe(1)
    expect(matches[0].rrfScore).toBeGreaterThan(0)
  })
})

describe('runWebSearch (AC3 — graceful degradation)', () => {
  it('returns the working provider results when the other provider fails', async () => {
    const adapters = [
      createExaAdapter({ fetchFn: makeFailingFetch(), apiKey: 'k' }),
      createTavilyAdapter({
        fetchFn: makeFetch([{ title: 'T', url: 'https://tavily.com/1', content: 'snippet' }]),
        apiKey: 'k',
      }),
    ]
    const results = await runWebSearch(adapters, 'query', 10)
    expect(results.length).toBe(1)
    expect(results[0].source).toBe('tavily')
  })

  it('returns an empty array when every provider fails', async () => {
    const adapters = [
      createExaAdapter({ fetchFn: makeFailingFetch(), apiKey: 'k' }),
      createTavilyAdapter({ fetchFn: makeFailingFetch(), apiKey: 'k' }),
    ]
    const results = await runWebSearch(adapters, 'query', 10)
    expect(results).toEqual([])
  })
})
