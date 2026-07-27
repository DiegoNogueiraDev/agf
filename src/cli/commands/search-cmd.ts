/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import { ZodError } from 'zod/v4'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { coerceLimit } from '../shared/coerce.js'
import { hierarchicalTreeSearch } from '../../core/rag/hierarchical-retrieval.js'
import { suffixArray, suffixArraySearch } from '../../core/algorithms/string/suffix-array.js'
import { compressIndex, type IndexEntry } from '../../core/economy/aaak-compressor.js'
import { buildMatchSnippet } from '../../core/search/match-snippet.js'
import { validateSearchQuery } from '../../core/search/validation.js'
import { federatedQuery, type StoreAdapter } from '../../core/store/federated-query.js'
import { tracedFederatedQuery } from '../../core/store/federated-trace.js'

const log = createLogger({ layer: 'cli', source: 'search-cmd.ts' })

/**
 * Compress each result's `id` via the AAAK dialect (compressIndex), adding a
 * `compressedId` field — shrinks repeated long node ids in large result sets
 * for output token economy while keeping the original `id` intact.
 */
function compressResultIds<T extends { id: string }>(
  results: T[],
): { results: (T & { compressedId: string })[]; compressionRatio: number } {
  const entries: IndexEntry[] = results.map((r) => ({ key: r.id, content: '' }))
  const compressed = compressIndex(entries)
  return {
    results: results.map((r, i) => ({ ...r, compressedId: compressed.entries[i].compressedKey })),
    compressionRatio: compressed.compressionRatio,
  }
}

/**
 * Literal substring search over node title+description via suffix array.
 * FTS5's sanitizeFtsQuery strips punctuation (`_`, `:`, `§`), so an exact node
 * id or a `§EPIC-1.2` citation never matches through the default BM25 path —
 * this is the exact-match escape hatch.
 */
function exactSearchNodes(
  nodes: Array<{ id: string; title: string; description?: string; type: string; status: string }>,
  query: string,
  limit: number,
): Array<{ id: string; title: string; type: string; status: string }> {
  const pattern = query.toLowerCase()
  const results: Array<{ id: string; title: string; type: string; status: string }> = []
  for (const n of nodes) {
    const haystack = `${n.title} ${n.description ?? ''}`.toLowerCase()
    if (suffixArraySearch(suffixArray(haystack), pattern) === -1) continue
    results.push({ id: n.id, title: n.title, type: n.type, status: n.status })
    if (results.length >= limit) break
  }
  return results
}

/** Builds the `agf search` CLI command (Commander definition). */
export function searchCommand(): Command {
  log.info('search command registered')
  return new Command('search')
    .description('Busca FTS5/BM25 sobre os nós do grafo (tool MCP `search`)')
    .argument('<query>', 'Texto da busca')
    .option('--limit <n>', 'Máximo de resultados', '20')
    .option('--hierarchical', 'Busca de navegação no índice ToC-tree (requer import-prd --build-tree)', false)
    .option(
      '--exact',
      'Substring literal (case-insensitive) via suffix array — para IDs/citações que o FTS5 tokeniza mal',
      false,
    )
    .option(
      '--compress',
      'Comprime os ids dos resultados via AAAK (compressIndex) — reduz tokens de saída em listas grandes',
      false,
    )
    .option('--snippet', 'Anexa um trecho de contexto ao redor do match em cada resultado', false)
    .option(
      '--federated',
      'Busca federada via federatedQuery: funde grafo (FTS) e índice RAG hierárquico, cada item marcado com source_store',
      false,
    )
    .option(
      '--trace',
      'Com --federated: usa tracedFederatedQuery e anexa meta.trace {traceId, partial, steps} para observabilidade cross-store',
      false,
    )
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action(
      async (
        query: string,
        opts: {
          limit: string
          dir: string
          hierarchical: boolean
          exact: boolean
          compress: boolean
          snippet: boolean
          federated: boolean
          trace: boolean
        },
      ) => {
        const out = createCliOutput('search')
        const rawLimit = coerceLimit(opts.limit, 20)

        let validated
        try {
          validated = validateSearchQuery({ query, limit: rawLimit })
        } catch (err) {
          const message = err instanceof ZodError ? err.issues.map((i) => i.message).join('; ') : String(err)
          out.err('VALIDATION_ERROR', `Input inválido: ${message}`)
          return
        }
        const validatedQuery = validated.query
        const limit = validated.limit ?? rawLimit

        const store = openStoreOrFail(opts.dir, { requireExisting: true })
        try {
          if (opts.federated) {
            const adapters: StoreAdapter[] = [
              { storeId: 'graph', query: async (q) => store.searchNodes(q, limit) },
              { storeId: 'rag', query: async (q) => hierarchicalTreeSearch(store.getDb(), q, limit) },
            ]
            if (opts.trace) {
              const traced = await tracedFederatedQuery({ query: validatedQuery }, adapters)
              out.ok(traced.items, {
                count: traced.items.length,
                warnings: traced.warnings,
                trace: traced.trace,
              })
              return
            }
            const federated = await federatedQuery({ query: validatedQuery }, adapters)
            out.ok(federated.items, { count: federated.items.length, warnings: federated.warnings })
            return
          }

          let results: Array<{ id: string }>
          if (opts.exact) {
            results = exactSearchNodes(store.getAllNodes(), validatedQuery, limit)
          } else if (opts.hierarchical) {
            results = hierarchicalTreeSearch(store.getDb(), validatedQuery, limit).map((h) => ({
              id: h.row.id,
              documentId: h.row.documentId,
              treePath: h.row.treePath,
              level: h.row.level,
              title: h.row.title,
              summary: h.row.summary,
              score: h.score,
            }))
          } else {
            results = store.searchNodes(validatedQuery, limit)
          }

          if (opts.compress) {
            const compressed = compressResultIds(results)
            out.ok(compressed.results, {
              count: compressed.results.length,
              compressionRatio: compressed.compressionRatio,
            })
            return
          }

          const payload = opts.snippet
            ? results.map((r) => {
                const withText = r as { description?: string; title?: string }
                return {
                  ...r,
                  snippet: buildMatchSnippet(withText.description ?? withText.title ?? '', validatedQuery),
                }
              })
            : results
          out.ok(payload, { count: results.length })
        } finally {
          store.close()
        }
      },
    )
}
