/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_23245d7bac20 — WIRE: deterministic prefetch trigger on start.
 * Integration test contra RealTaskLifecycleService.startTask: verifica que
 * a chamada a prefetchNextContext ocorre automaticamente no fluxo real.
 *
 * AC1: Given a next task exists, When a task enters in_progress, Then prefetch
 *      occurs exactly once (context+brief da próxima task no cache).
 * AC2: Given no next task (empty queue), When a task enters in_progress, Then
 *      prefetch fails safely as a no-op with no error and no cost.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { RealTaskLifecycleService } from '../core/services/task-lifecycle.js'
import { getPrefetchedContext } from '../core/planner/prefetch-next-context.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function seedNode(
  store: SqliteStore,
  overrides: Partial<GraphNode> & { id: string; type: GraphNode['type']; title: string },
): void {
  const now = new Date().toISOString()
  store.insertNode({
    id: overrides.id,
    type: overrides.type,
    title: overrides.title,
    description: overrides.description ?? '',
    status: overrides.status ?? 'backlog',
    priority: overrides.priority ?? 3,
    xpSize: overrides.xpSize ?? 'S',
    parentId: overrides.parentId ?? null,
    acceptanceCriteria: overrides.acceptanceCriteria ?? ['Given X, When Y, Then Z'],
    tags: overrides.tags ?? [],
    createdAt: now,
    updatedAt: now,
    metadata: {},
  })
}

describe('prefetch trigger on startTask', () => {
  let store: SqliteStore
  let service: RealTaskLifecycleService

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('prefetch-trigger-test')
    service = new RealTaskLifecycleService(store)
  })

  afterEach(() => {
    store.close()
  })

  it('AC1: startTask com next task no backlog → prefetch ac heada contexto+brief da próxima', () => {
    seedNode(store, { id: 'task_a', type: 'task', title: 'Current task', status: 'backlog' })
    seedNode(store, { id: 'task_b', type: 'task', title: 'Next task', status: 'backlog', priority: 2 })

    const ctx = service.startTask('task_a')

    expect(ctx).not.toBeNull()
    expect(ctx!.node.id).toBe('task_a')
    expect(ctx!.node.status).toBe('in_progress')

    // Prefetch deve ter ocorrido como efeito colateral — task_b cac heada no DB
    const cached = getPrefetchedContext(store, 'task_b')
    expect(cached).not.toBeNull()
    expect(cached!.nodeId).toBe('task_b')
    expect(cached!.context.length).toBeGreaterThan(0)
    expect(cached!.brief.length).toBeGreaterThan(0)
  })

  it('AC2: startTask sem next task no backlog → prefetch no-op, sem erro, sem cache', () => {
    seedNode(store, { id: 'only_task', type: 'task', title: 'Só esta', status: 'backlog' })

    // Não deve lançar — prefetch é best-effort
    expect(() => service.startTask('only_task')).not.toThrow()

    // Nenhuma entrada de cache deve existir
    const row = store.getDb().prepare('SELECT COUNT(*) AS cnt FROM prefetch_context_cache').get() as { cnt: number }
    expect(row.cnt).toBe(0)
  })
})
