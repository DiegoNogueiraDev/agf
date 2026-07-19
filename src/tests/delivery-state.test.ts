/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_a0ef12c7d8be — deriveDeliveryState: mapeia o estado do store para o
 * DeliveryState consumido pelo orquestrador.
 */
import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { deriveDeliveryState } from '../core/orchestrator/delivery-state.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function node(
  id: string,
  type: GraphNode['type'],
  status: GraphNode['status'],
  over: Partial<GraphNode> = {},
): GraphNode {
  return {
    id,
    type,
    title: id,
    status,
    priority: 3,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...over,
  }
}

describe('deriveDeliveryState — store → orquestrador (#O4)', () => {
  it('grafo vazio → totalNodes 0, sem requirements', () => {
    const store = SqliteStore.open(':memory:')
    const s = deriveDeliveryState(store)
    expect(s.totalNodes).toBe(0)
    expect(s.hasRequirements).toBe(false)
    store.close()
  })

  it('com epic + tasks prontas → hasRequirements e readyTasks>0', () => {
    const store = SqliteStore.open(':memory:')
    store.initProject('p')
    store.bulkInsert(
      [
        node('e1', 'epic', 'backlog', { acceptanceCriteria: ['ac'] }),
        node('t1', 'task', 'ready', { parentId: 'e1', acceptanceCriteria: ['ac'] }),
      ],
      [],
    )
    const s = deriveDeliveryState(store)
    expect(s.hasRequirements).toBe(true)
    expect(s.readyTasks + s.inProgress).toBeGreaterThan(0)
    store.close()
  })

  it('todas as tasks done → doneRatio 1', () => {
    const store = SqliteStore.open(':memory:')
    store.initProject('p')
    store.bulkInsert(
      [
        node('e1', 'epic', 'done'),
        node('t1', 'task', 'done', { parentId: 'e1' }),
        node('t2', 'task', 'done', { parentId: 'e1' }),
      ],
      [],
    )
    const s = deriveDeliveryState(store)
    expect(s.doneRatio).toBe(1)
    store.close()
  })
})
