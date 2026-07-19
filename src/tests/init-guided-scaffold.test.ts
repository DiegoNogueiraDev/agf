/*!
 * TDD: agf init --guided scaffold (node_1b73cf78f2eb).
 *
 * AC1: Given empty graph, scaffoldGuidedStarter creates 1 epic + 1 task with >=2 AC.
 * AC2: Given non-empty graph, scaffoldGuidedStarter adds 0 nodes.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { scaffoldGuidedStarter } from '../core/init/scaffold-guided-starter.js'

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('test-guided')
  return store
}

describe('AC1: empty graph gets sample epic + task', () => {
  it('creates exactly 1 epic and 1 task on empty graph', () => {
    const store = makeStore()
    const result = scaffoldGuidedStarter(store)

    expect(result.added).toBe(true)
    const doc = store.toGraphDocument()
    const epics = doc.nodes.filter((n) => n.type === 'epic')
    const tasks = doc.nodes.filter((n) => n.type === 'task')
    expect(epics).toHaveLength(1)
    expect(tasks).toHaveLength(1)
    store.close()
  })

  it('sample task has >= 2 AC', () => {
    const store = makeStore()
    scaffoldGuidedStarter(store)
    const doc = store.toGraphDocument()
    const task = doc.nodes.find((n) => n.type === 'task')!
    const acNodes = doc.nodes.filter((n) => n.type === 'acceptance_criteria' && n.parentId === task.id)
    expect(acNodes.length).toBeGreaterThanOrEqual(2)
    store.close()
  })
})

describe('AC2: non-empty graph adds zero nodes', () => {
  it('skips scaffold when tasks already exist', () => {
    const store = makeStore()
    // Pre-populate with one task
    store.insertNode({
      id: 'existing-task',
      type: 'task',
      title: 'Existing Task',
      status: 'backlog',
      priority: 3,
      blocked: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as import('../core/graph/graph-types.js').GraphNode)

    const before = store.toGraphDocument().nodes.length
    const result = scaffoldGuidedStarter(store)

    expect(result.added).toBe(false)
    expect(store.toGraphDocument().nodes.length).toBe(before)
    store.close()
  })
})
