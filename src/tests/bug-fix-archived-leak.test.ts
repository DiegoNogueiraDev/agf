/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Regression test for: "Read methods leak soft-deleted nodes (missing archived filter)"
 * Bug node: node_8348534d463d
 *
 * getNodeById/getAllNodes filter `(archived = 0 OR archived IS NULL)`, but
 * getNodesByStatus, getNodesByType, getChildNodes, queryNodes and getStats did
 * not — so a soft-deleted (archived) node leaked back into status/type/parent
 * queries, the next-task pull and stats. Each read method below must exclude an
 * archived node.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  const ts = new Date().toISOString()
  return {
    id: `node_${Math.random().toString(36).slice(2, 10)}`,
    type: 'task',
    title: 'Test Node',
    status: 'backlog',
    priority: 3,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  }
}

describe('bug-fix: read methods exclude soft-deleted nodes', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject()
  })

  afterEach(() => {
    store?.close()
  })

  it('getNodesByStatus excludes an archived node', () => {
    const keep = makeNode({ status: 'backlog', title: 'keep' })
    const gone = makeNode({ status: 'backlog', title: 'gone' })
    store.insertNode(keep)
    store.insertNode(gone)
    store.deleteNode(gone.id)

    const items = store.getNodesByStatus('backlog')
    expect(items.map((n) => n.id)).toEqual([keep.id])
  })

  it('getNodesByType excludes an archived node', () => {
    const keep = makeNode({ type: 'task', title: 'keep' })
    const gone = makeNode({ type: 'task', title: 'gone' })
    store.insertNode(keep)
    store.insertNode(gone)
    store.deleteNode(gone.id)

    const items = store.getNodesByType('task')
    expect(items.map((n) => n.id)).toEqual([keep.id])
  })

  it('getChildNodes excludes an archived child', () => {
    const parent = makeNode({ type: 'epic', title: 'parent' })
    const keep = makeNode({ type: 'task', title: 'keep' })
    const gone = makeNode({ type: 'task', title: 'gone' })
    store.insertNode(parent)
    store.insertNode(keep)
    store.insertNode(gone)
    store.updateNode(keep.id, { parentId: parent.id })
    store.updateNode(gone.id, { parentId: parent.id })
    store.deleteNode(gone.id)

    const children = store.getChildNodes(parent.id)
    expect(children.map((n) => n.id)).toEqual([keep.id])
  })

  it('queryNodes excludes an archived node from results and totalCount', () => {
    const keep = makeNode({ status: 'backlog', title: 'keep' })
    const gone = makeNode({ status: 'backlog', title: 'gone' })
    store.insertNode(keep)
    store.insertNode(gone)
    store.deleteNode(gone.id)

    const result = store.queryNodes({ status: ['backlog'] })
    expect(result.totalCount).toBe(1)
    expect(result.nodes.map((n) => n.id)).toEqual([keep.id])
  })

  it('getStats does not count an archived node', () => {
    const keep = makeNode({ status: 'backlog', type: 'task' })
    const gone = makeNode({ status: 'backlog', type: 'task' })
    store.insertNode(keep)
    store.insertNode(gone)
    store.deleteNode(gone.id)

    const stats = store.getStats()
    expect(stats.totalNodes).toBe(1)
    expect(stats.byType.task).toBe(1)
    expect(stats.byStatus.backlog).toBe(1)
  })
})
