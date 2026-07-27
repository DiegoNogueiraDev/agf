/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Wires core/search/external-search-port.ts (ExternalSearchPort, RRF merge) into
 * the CLI — the module had no consuming surface (dormant, harness --dormant
 * flagged it no-surface). Fans out to whichever of Exa/Tavily has an API key
 * configured, then RRF-ranks the combined, deduped results.
 */

import { Command } from 'commander'
import { createCliOutput } from '../shared/cli-output.js'
import { coerceLimit } from '../shared/coerce.js'
import {
  createExaAdapter,
  createTavilyAdapter,
  mergeWithRrf,
  type FetchLike,
  type SearchResult,
} from '../../core/search/external-search-port.js'

interface ProviderAdapter {
  search(query: string, maxResults: number): Promise<SearchResult[]>
}

/** Builds one adapter per provider API key present in env — skips unconfigured providers. */
export function buildAdaptersFromEnv(env: Record<string, string | undefined>, fetchFn: FetchLike): ProviderAdapter[] {
  const adapters: ProviderAdapter[] = []
  if (env.EXA_API_KEY) adapters.push(createExaAdapter({ fetchFn, apiKey: env.EXA_API_KEY }))
  if (env.TAVILY_API_KEY) adapters.push(createTavilyAdapter({ fetchFn, apiKey: env.TAVILY_API_KEY }))
  return adapters
}

/**
 * Runs each adapter independently (graceful degradation — a rejected adapter is
 * dropped, not thrown) then RRF-ranks the per-adapter ranked lists via mergeWithRrf.
 */
export async function runWebSearch(
  adapters: ProviderAdapter[],
  query: string,
  maxResults: number,
): Promise<(SearchResult & { rrfScore: number })[]> {
  const settled = await Promise.allSettled(adapters.map((a) => a.search(query, maxResults)))
  const perSource = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value)
  return mergeWithRrf(perSource)
}

/** Builds the `agf web-search` CLI command (Commander definition). */
export function webSearchCommand(): Command {
  return new Command('web-search')
    .description('Busca externa via Exa/Tavily (ExternalSearchPort), deduped + RRF-ranked')
    .argument('<query>', 'Termo de busca')
    .option('--limit <n>', 'Máximo de resultados por provider', '10')
    .action(async (query: string, opts: { limit: string }) => {
      const out = createCliOutput('web-search')
      const adapters = buildAdaptersFromEnv(process.env, globalThis.fetch as unknown as FetchLike)
      if (adapters.length === 0) {
        out.err('NO_PROVIDER_KEY', 'Configure EXA_API_KEY e/ou TAVILY_API_KEY para usar agf web-search')
        return
      }
      const maxResults = coerceLimit(opts.limit, 10)
      const results = await runWebSearch(adapters, query, maxResults)
      out.ok({ results }, { count: results.length })
    })
}
