/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * prefetch-next-context — função determinística (~0 LLM) que cac head o
 * context-pack + brief da próxima task ranqueada, persistindo em
 * prefetch_context_cache (SQLite). O consumidor (context-cmd / brief-cmd)
 * serve do cache no lugar de re-computar do zero.
 *
 * COMPÕE (não recria): findNextTask (picker do agf next), buildTaskContext
 * (contexto completo), summarizeTaskContext (narrativa), buildExecutorBrief
 * + renderBriefPrompt (brief de delegação).
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import { findNextTask } from './next-task.js'
import { buildTaskContext, summarizeTaskContext } from '../context/compact-context.js'
import { buildExecutorBrief, renderBriefPrompt } from '../context/executor-brief.js'
import { createLogger } from '../utils/logger.js'

const CACHE_TABLE = 'prefetch_context_cache'
const CACHE_TTL_MS = 5 * 60_000

const log = createLogger({ layer: 'core', source: 'prefetch-next-context.ts' })

export interface PrefetchedNext {
  nodeId: string
  context: string
  brief: string
}

/**
 * Computa e cac hea o context-pack + brief da próxima task ranqueada.
 * Determinístico (zero LLM) — compõe buildTaskContext + summarizeTaskContext +
 * buildExecutorBrief + renderBriefPrompt. Tudo sync.
 * Retorna o PrefetchedNext cac heado, ou null se não há próxima task.
 */
export function prefetchNextContext(store: SqliteStore): PrefetchedNext | null {
  const doc = store.toGraphDocument()
  const next = findNextTask(doc)
  if (!next) return null

  const nodeId = next.node.id
  const ctx = buildTaskContext(store, nodeId)
  if (!ctx) return null

  const context = summarizeTaskContext(ctx)
  const brief = buildExecutorBrief(store, nodeId)
  const briefPrompt = brief ? renderBriefPrompt(brief) : ''

  // Persiste no DB (prefetch_context_cache). Best-effort: falha não propaga.
  try {
    const db = store.getDb()
    db.prepare(
      `INSERT OR REPLACE INTO ${CACHE_TABLE} (node_id, context_json, brief_json, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(nodeId, context, briefPrompt, Date.now())
    log.debug('prefetch:stored', { nodeId, contextLen: context.length, briefLen: briefPrompt.length })
  } catch (err) {
    log.warn('prefetch:db_write_failed', { nodeId, error: err instanceof Error ? err.message : String(err) })
  }

  return { nodeId, context, brief: briefPrompt }
}

/**
 * Lê o contexto cac heado do DB. Retorna null se não existe ou expirou (TTL 5 min).
 */
export function getPrefetchedContext(store: SqliteStore, nodeId: string): PrefetchedNext | null {
  try {
    const db = store.getDb()
    const row = db
      .prepare(`SELECT context_json, brief_json, created_at FROM ${CACHE_TABLE} WHERE node_id = ?`)
      .get(nodeId) as { context_json: string; brief_json: string; created_at: number } | undefined
    if (!row) return null
    if (Date.now() - row.created_at > CACHE_TTL_MS) {
      db.prepare(`DELETE FROM ${CACHE_TABLE} WHERE node_id = ?`).run(nodeId)
      return null
    }
    return { nodeId, context: row.context_json, brief: row.brief_json }
  } catch {
    return null
  }
}

/**
 * Invalida o cache se a task solicitada difere da pré-buscada.
 * Silencia sem erro se o cache está vazio ou coincide.
 */
export function invalidatePrefetchCache(store: SqliteStore, requestedNodeId: string): void {
  try {
    const db = store.getDb()
    const cached = db.prepare(`SELECT node_id FROM ${CACHE_TABLE} LIMIT 1`).get() as { node_id: string } | undefined
    if (cached && cached.node_id !== requestedNodeId) {
      db.prepare(`DELETE FROM ${CACHE_TABLE}`).run()
      log.debug('prefetch:invalidated', { requested: requestedNodeId, cached: cached.node_id })
    }
  } catch {
    // Best-effort
  }
}

/**
 * Retorna a entrada cac heada sem invalidar (para stats/cache-cmd).
 */
export function getCurrentPrefetchCache(store: SqliteStore): PrefetchedNext | null {
  try {
    const db = store.getDb()
    const row = db.prepare(`SELECT node_id, context_json, brief_json, created_at FROM ${CACHE_TABLE} LIMIT 1`).get() as
      { node_id: string; context_json: string; brief_json: string; created_at: number } | undefined
    if (!row) return null
    if (Date.now() - row.created_at > CACHE_TTL_MS) {
      db.prepare(`DELETE FROM ${CACHE_TABLE}`).run()
      return null
    }
    return { nodeId: row.node_id, context: row.context_json, brief: row.brief_json }
  } catch {
    return null
  }
}
