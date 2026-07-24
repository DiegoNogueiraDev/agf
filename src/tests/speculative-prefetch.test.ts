/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_cc4c4c7e02e2 — prefetchNextContext: computa+cache o context-pack e
 * brief da próxima task sem LLM, persistindo em prefetch_context_cache (SQLite).
 * AC1: task A in_progress → brief de B no cache. AC2: contexto+brief servido
 * do cache. AC3: mismatch no cache → invalida silenciosa.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import {
  prefetchNextContext,
  getPrefetchedContext,
  invalidatePrefetchCache,
} from '../core/planner/prefetch-next-context.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function addTask(
  store: SqliteStore,
  id: string,
  status: GraphNode['status'] = 'backlog',
  acs: string[] = ['Given X, When Y, Then Z'],
): void {
  const now = new Date().toISOString()
  store.insertNode({
    id,
    type: 'task',
    title: `Task ${id}`,
    status,
    priority: 3,
    acceptanceCriteria: acs,
    tags: [],
    createdAt: now,
    updatedAt: now,
  } as GraphNode)
}

describe('prefetchNextContext', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('speculative-prefetch')
  })

  afterEach(() => {
    store.close()
  })

  it('AC1: task A in_progress → prefetch salva brief de B no cache', () => {
    addTask(store, 'task_a', 'in_progress')
    addTask(store, 'task_b')

    const result = prefetchNextContext(store)

    expect(result).not.toBeNull()
    expect(result!.nodeId).toBe('task_b')
    expect(result!.context.length).toBeGreaterThan(0)
    expect(result!.brief.length).toBeGreaterThan(0)

    // Verifica persistência no DB
    const row = store
      .getDb()
      .prepare('SELECT node_id, context_json, brief_json FROM prefetch_context_cache WHERE node_id = ?')
      .get('task_b') as { node_id: string; context_json: string; brief_json: string } | undefined
    expect(row).toBeDefined()
    expect(row!.context_json).toBe(result!.context)
    expect(row!.brief_json).toBe(result!.brief)
  })

  it('AC2: getPrefetchedContext retorna o contexto cac heado (cache hit)', () => {
    addTask(store, 'task_a', 'in_progress')
    addTask(store, 'task_b')

    prefetchNextContext(store)

    const cached = getPrefetchedContext(store, 'task_b')
    expect(cached).not.toBeNull()
    expect(cached!.nodeId).toBe('task_b')
    expect(cached!.context.length).toBeGreaterThan(0)
    expect(cached!.brief.length).toBeGreaterThan(0)
  })

  it('AC3: prefetch cac heado para B mas task C solicitada → invalida sem erro', () => {
    addTask(store, 'task_a', 'in_progress')
    addTask(store, 'task_b')
    // task_c é adicionada mas não é a próxima ranqueada (B é a mais antiga)
    addTask(store, 'task_c')

    prefetchNextContext(store)

    // Cache tem B, mas o usuário começa C → invalida silenciosamente
    invalidatePrefetchCache(store, 'task_c')

    const cached = getPrefetchedContext(store, 'task_b')
    expect(cached).toBeNull()
  })

  it('retorna null quando não há próxima task', () => {
    // Só task_a in_progress, nenhuma backlog
    addTask(store, 'task_a', 'in_progress')

    const result = prefetchNextContext(store)
    expect(result).toBeNull()
  })
})
