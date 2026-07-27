/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_56f05fb502ce — buildProgressSnapshot: estado do grafo serializável para
 * a web mínima de progresso.
 */
import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { buildProgressSnapshot } from '../core/web/progress-snapshot.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function node(id: string, type: GraphNode['type'], status: GraphNode['status']): GraphNode {
  return {
    id,
    type,
    title: id,
    status,
    priority: 3,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }
}

describe('buildProgressSnapshot — store → JSON (#W1)', () => {
  it('store com epic+tasks → snapshot serializável com project, tasks e tokens', () => {
    const store = SqliteStore.open(':memory:')
    store.initProject('kanban')
    store.bulkInsert([node('e1', 'epic', 'backlog'), node('t1', 'task', 'in_progress')], [])
    const snap = buildProgressSnapshot(store)
    expect(snap.project).toBe('kanban')
    expect(Array.isArray(snap.tasks)).toBe(true)
    expect(snap.tokens).toBeDefined()
    expect(typeof snap.totalTasks).toBe('number')
    expect(() => JSON.stringify(snap)).not.toThrow()
    store.close()
  })

  it('store sem projeto → snapshot válido (não lança)', () => {
    const store = SqliteStore.open(':memory:')
    const snap = buildProgressSnapshot(store)
    expect(snap.totalTasks).toBe(0)
    expect(() => JSON.stringify(snap)).not.toThrow()
    store.close()
  })
})
