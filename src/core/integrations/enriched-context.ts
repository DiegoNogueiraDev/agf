/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Enriched Context Builder — combines project memories with native Code Intelligence
 * for a unified symbol context. All data sourced locally.
 */

import { readAllMemories, type ProjectMemory } from '../memory/memory-reader.js'
import { migrateSerenaMemories } from '../memory/memory-migrator.js'
import { createLogger } from '../utils/logger.js'
import { CodeStore } from '../code/code-store.js'
import { getSymbolContext } from '../code/graph-traversal.js'
import type { CodeGraphData } from '../code/code-types.js'

const log = createLogger({ layer: 'core', source: 'enriched-context.ts' })

export interface EnrichedContext {
  symbol: string
  memories: {
    available: boolean
    relevantMemories: Array<{ name: string; excerpt: string }>
  }
  codeGraph: {
    available: boolean
    data?: CodeGraphData
  }
  combined: string
}

export class EnrichedContextTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`)
    this.name = 'EnrichedContextTimeoutError'
  }
}

/** withOperationTimeout —  */
export async function withOperationTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          'abort',
          () => reject(new EnrichedContextTimeoutError(operationName, timeoutMs)),
          { once: true },
        )
      }),
    ])
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Filter memories that mention the given symbol (case-insensitive).
 */
function filterRelevantMemories(memories: ProjectMemory[], symbol: string): Array<{ name: string; excerpt: string }> {
  const lower = symbol.toLowerCase()

  return memories
    .filter((m) => m.content.toLowerCase().includes(lower))
    .map((m) => {
      const lines = m.content.split('\n')
      const relevant = lines.filter((l) => l.toLowerCase().includes(lower))
      const excerpt = relevant.slice(0, 5).join('\n') || m.content.slice(0, 200)
      return { name: m.name, excerpt }
    })
}

/**
 * Query native Code Intelligence engine for symbol context.
 */
function fetchCodeContext(
  symbol: string,
  db: import('better-sqlite3').Database | null,
  projectId: string,
): { available: boolean; data?: CodeGraphData } {
  if (!db) return { available: false }

  try {
    const codeStore = new CodeStore(db)
    const meta = codeStore.getIndexMeta(projectId)
    if (!meta) return { available: false }

    const context = getSymbolContext(codeStore, symbol, projectId)
    return {
      available: true,
      data: context.symbols.length > 0 ? context : undefined,
    }
  } catch {
    return { available: false }
  }
}

/**
 * Build enriched context for a symbol by combining project memories + native Code Intelligence.
 */
export async function buildEnrichedContext(
  symbol: string,
  basePath: string,
  timeoutMs = 5_000,
  options?: { db?: import('better-sqlite3').Database; projectId?: string },
): Promise<EnrichedContext> {
  log.info('Building enriched context', { symbol, basePath })

  // Lazy migration: copy .serena/memories → workflow-graph/memories if needed
  try {
    await withOperationTimeout(migrateSerenaMemories(basePath), timeoutMs, 'migrateSerenaMemories')
  } catch (err) {
    log.warn('Enriched context migration timeout/failure', {
      symbol,
      timeoutMs,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Fetch data from both sources in parallel
  const [memoriesResult, codeGraphResult] = await Promise.allSettled([
    withOperationTimeout(readAllMemories(basePath), timeoutMs, 'readAllMemories'),
    withOperationTimeout(
      Promise.resolve(fetchCodeContext(symbol, options?.db ?? null, options?.projectId ?? 'default')),
      timeoutMs,
      'fetchCodeContext',
    ),
  ])

  if (memoriesResult.status === 'rejected') {
    log.warn('Enriched context memories unavailable', {
      symbol,
      timeoutMs,
      error: memoriesResult.reason instanceof Error ? memoriesResult.reason.message : String(memoriesResult.reason),
    })
  }
  if (codeGraphResult.status === 'rejected') {
    log.warn('Enriched context code graph unavailable', {
      symbol,
      timeoutMs,
      error: codeGraphResult.reason instanceof Error ? codeGraphResult.reason.message : String(codeGraphResult.reason),
    })
  }

  const memories = memoriesResult.status === 'fulfilled' ? memoriesResult.value : []
  const codeGraph = codeGraphResult.status === 'fulfilled' ? codeGraphResult.value : { available: false }

  const memoriesAvailable = memories.length > 0
  const relevantMemories = filterRelevantMemories(memories, symbol)

  // Build combined summary
  const parts: string[] = [`Symbol: ${symbol}`]

  if (relevantMemories.length > 0) {
    parts.push(`\nMemories (${relevantMemories.length} relevant):`)
    for (const mem of relevantMemories) {
      parts.push(`  [${mem.name}] ${mem.excerpt.split('\n')[0]}`)
    }
  }

  if (codeGraph.available && codeGraph.data) {
    parts.push(`\nCode Graph: ${codeGraph.data.symbols.length} symbols, ${codeGraph.data.relations.length} relations`)
  } else if (!codeGraph.available) {
    parts.push('\nCode Intelligence: Not indexed. Run reindex first.')
  }

  const combined = parts.join('\n')

  log.info('Enriched context built', {
    symbol,
    memories: relevantMemories.length,
    codeGraphAvailable: codeGraph.available,
  })

  return {
    symbol,
    memories: {
      available: memoriesAvailable,
      relevantMemories,
    },
    codeGraph,
    combined,
  }
}
