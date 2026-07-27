/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { Command } from 'commander'
import type { Database } from 'better-sqlite3'
import { openStoreOrFail } from '../open-store.js'
import { createLogger } from '../../core/utils/logger.js'
import { createCliOutput } from '../shared/cli-output.js'
import { CcrStore } from '../../core/economy/ccr-store.js'
import { ToolOutputStore } from '../../core/context/tool-output-store.js'
import { rankChunksByBm25 } from '../../core/context/bm25-compressor.js'

/** Prefixo de um handle de saída de ferramenta offloaded (ver tool-output-store). */
const TOOL_OUTPUT_PREFIX = 'tool-output://'

const log = createLogger({ layer: 'cli', source: 'retrieve-cmd.ts' })

/** A BM25-ranked slice of a retrieved CCR original. */
export interface RetrieveMatch {
  /** The passage text. */
  text: string
  /** BM25 relevance score against the query (higher = more relevant). */
  score: number
  /** Zero-based index of this passage within the original (in document order). */
  index: number
}

/**
 * Split an original into passages: blank-line-separated paragraphs when the
 * text contains any, otherwise per non-empty line. Deterministic and pure.
 */
export function splitPassages(original: string): string[] {
  const normalized = original.replace(/\r\n/g, '\n')
  if (/\n\s*\n/.test(normalized)) {
    return normalized
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
  }
  return normalized
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

/**
 * Rank an original's passages by BM25 relevance to a query and return the top
 * `limit`. Pure and deterministic — unit-testable in isolation.
 */
export function rankPassages(original: string, query: string, limit: number): RetrieveMatch[] {
  const passages = splitPassages(original)
  if (passages.length === 0) return []

  const indexOf = new Map<string, number>()
  passages.forEach((p, i) => {
    if (!indexOf.has(p)) indexOf.set(p, i)
  })

  const ranked = rankChunksByBm25(passages, query)
  return ranked.slice(0, Math.max(0, limit)).map((r) => ({
    text: r.content,
    score: r.score,
    index: indexOf.get(r.content) ?? 0,
  }))
}

/** Successful retrieval payload (with or without a query). */
export type RetrieveResult =
  { hash: string; original: string } | { hash: string; query: string; matches: RetrieveMatch[] }

/**
 * Resolve um handle para o seu original e hash bare. Aceita tanto um hash CCR
 * cru quanto um handle `tool-output://<hash>` (T2.4), compartilhando o caminho
 * de resgate: CCR para hashes crus, tool-output store para handles prefixados.
 *
 * @returns `{hash, original}` ou `null` se nada casar.
 */
export function resolveOriginal(db: Database, handle: string): { hash: string; original: string } | null {
  if (handle.startsWith(TOOL_OUTPUT_PREFIX)) {
    const bareHash = handle.slice(TOOL_OUTPUT_PREFIX.length)
    const original = new ToolOutputStore(db).get(bareHash)
    return original === null ? null : { hash: bareHash, original }
  }
  const original = new CcrStore(db).get(handle)
  return original === null ? null : { hash: handle, original }
}

/**
 * Core retrieve logic against an open DB handle — returns the payload or `null`
 * when no entry matches the handle (CCR hash or `tool-output://` handle). Pure
 * of CLI/IO concerns (no envelope), so it is directly unit-testable.
 */
export function runRetrieve(
  db: Database,
  hash: string,
  query: string | undefined,
  limit: number,
): RetrieveResult | null {
  const resolved = resolveOriginal(db, hash)
  if (resolved === null) return null
  const { hash: bareHash, original } = resolved
  if (query === undefined || query.trim() === '') {
    return { hash: bareHash, original }
  }
  return { hash: bareHash, query, matches: rankPassages(original, query, limit) }
}

/** Builds the `agf retrieve` CLI command (Commander definition). */
export function retrieveCommand(): Command {
  log.info('retrieve command registered')
  return new Command('retrieve')
    .description(
      'Retrieve a cached original by ⟨ccr:hash⟩ or a tool-output://<hash> handle — optionally BM25-ranked by --query',
    )
    .argument('<hash>', 'A ⟨ccr:hash⟩ sha256, or a full tool-output://<hash> handle')
    .option('--query <q>', 'Return BM25-ranked slices of the original matching this query')
    .option('--limit <n>', 'Max ranked slices to return (with --query)', (v) => Number.parseInt(v, 10), 5)
    .option('-d, --dir <dir>', 'Diretório do projeto', process.cwd())
    .action((hash: string, opts: { query?: string; limit: number; dir: string }) => {
      const out = createCliOutput('retrieve')
      const store = openStoreOrFail(opts.dir, { requireExisting: true })
      try {
        const result = runRetrieve(store.getDb(), hash, opts.query, opts.limit)
        if (result === null) {
          out.err('NOT_FOUND', `no CCR entry for hash ${hash}`)
          return
        }
        out.ok(result)
      } finally {
        store.close()
      }
    })
}
