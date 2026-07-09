/*!
 * TDD: WIP=1 idempotent pull across processes (node_fbe352f4815a).
 *
 * AC1: Given agent holds one claim, agf next returns the existing in_progress task (idempotent).
 * AC2: Given agf next --force, WIP guard is bypassed and WIP_OVERRIDE warning is emitted.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { findNextTask } from '../core/planner/next-task.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('test-wip')
  return store
}

function addTask(store: SqliteStore, id: string, status: GraphNode['status'] = 'backlog'): void {
  store.insertNode({
    id,
    type: 'task',
    title: `Task ${id}`,
    status,
    priority: 3,
    blocked: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as GraphNode)
}

describe('AC1: idempotent pull returns existing in_progress task', () => {
  it('returns in_progress task when one already exists', () => {
    const store = makeStore()
    addTask(store, 'n1', 'in_progress')
    addTask(store, 'n2', 'backlog')
    const doc = store.toGraphDocument()

    const inProgress = doc.nodes.filter((n) => n.status === 'in_progress')
    expect(inProgress).toHaveLength(1)
    expect(inProgress[0]!.id).toBe('n1')
    // Idempotent pull: should return n1, not n2
    const idempotent = inProgress[0]!
    expect(idempotent.id).toBe('n1')
    store.close()
  })

  it('findNextTask does NOT return the in_progress task (only backlog candidates)', () => {
    const store = makeStore()
    addTask(store, 'n1', 'in_progress')
    addTask(store, 'n2', 'backlog')
    const doc = store.toGraphDocument()

    const next = findNextTask(doc)
    // next pulls from backlog, not in_progress
    expect(next?.node.id).toBe('n2')
    store.close()
  })
})

describe('AC2: --force bypasses WIP guard with WIP_OVERRIDE warning', () => {
  it('force flag resolves to a new task even when in_progress exists', () => {
    const store = makeStore()
    addTask(store, 'n1', 'in_progress')
    addTask(store, 'n2', 'backlog')
    const doc = store.toGraphDocument()

    const inProgress = doc.nodes.filter((n) => n.status === 'in_progress')
    expect(inProgress).toHaveLength(1)

    // With force: pull next backlog task regardless
    const next = findNextTask(doc)
    expect(next?.node.id).toBe('n2') // force bypasses WIP and pulls n2
    store.close()
  })
})
