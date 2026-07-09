/*!
 * TDD: stats differentiates work nodes from spec nodes (node_3459a3e40186).
 *
 * AC1: data.backlogWork counts only task/subtask/epic, data.specNodes lists others separately.
 * AC2: spec-nodes don't affect byStatus counts (they remain spec-accurate but are separated).
 * AC3: no node is mutated — only aggregation changes.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { generateId } from '../core/utils/id.js'
import { separateWorkStats } from '../core/graph/stats-work-types.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('Test')
  return store
}

function addNode(store: SqliteStore, type: string, status: string = 'backlog'): void {
  const now = new Date().toISOString()
  const node: GraphNode = {
    id: generateId('node'),
    type: type as never,
    title: `${type}-node`,
    status: status as never,
    priority: 3,
    createdAt: now,
    updatedAt: now,
  }
  store.insertNode(node)
}

describe('AC1: separateWorkStats distinguishes work from spec', () => {
  it('backlogWork counts task, subtask, epic', () => {
    const store = makeStore()
    addNode(store, 'task', 'backlog')
    addNode(store, 'subtask', 'backlog')
    addNode(store, 'epic', 'backlog')
    addNode(store, 'constraint', 'backlog')
    addNode(store, 'risk', 'backlog')

    const stats = store.getStats()
    const { backlogWork, specNodes } = separateWorkStats(stats)

    expect(backlogWork).toBe(3) // task + subtask + epic
    expect(specNodes).toBeGreaterThanOrEqual(2) // constraint + risk
  })

  it('specNodes includes constraint, risk, requirement types', () => {
    const store = makeStore()
    addNode(store, 'constraint', 'backlog')
    addNode(store, 'risk', 'backlog')
    addNode(store, 'requirement', 'backlog')
    addNode(store, 'task', 'done')

    const stats = store.getStats()
    const { specNodes } = separateWorkStats(stats)

    expect(specNodes).toBe(3)
  })

  it('work nodes in done status are not counted in backlogWork', () => {
    const store = makeStore()
    addNode(store, 'task', 'done')
    addNode(store, 'task', 'backlog')

    const stats = store.getStats()
    const { backlogWork } = separateWorkStats(stats)

    expect(backlogWork).toBe(1) // only backlog task
  })
})

describe('AC2: spec-nodes are separated, not removed from byStatus', () => {
  it('byStatus still reflects all nodes (backward-compat)', () => {
    const store = makeStore()
    addNode(store, 'task', 'backlog')
    addNode(store, 'risk', 'backlog')

    const stats = store.getStats()
    expect(stats.byStatus['backlog']).toBe(2) // both counted
  })
})

describe('AC3: no mutation — only aggregation', () => {
  it('getStats result has same byType after separateWorkStats', () => {
    const store = makeStore()
    addNode(store, 'task', 'backlog')
    addNode(store, 'risk', 'backlog')

    const stats1 = store.getStats()
    separateWorkStats(stats1)
    const stats2 = store.getStats()

    expect(stats2.byType).toEqual(stats1.byType)
  })
})
