/*!
 * TDD: spec-close-on-done — when a task implementing a spec reaches done,
 * the spec transitions to satisfied (node_a5f004d50611).
 *
 * AC1: contract with one implementer task → done → contract satisfied.
 * AC2: requirement with >1 implementer → all done → satisfied; partial → stays.
 * AC3: spec without implementer → not auto-closed.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { generateId } from '../core/utils/id.js'
import { closeSpecOnImplementerDone, backfillSatisfiedSpecs } from '../core/graph/spec-close-on-done.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function now(): string {
  return new Date().toISOString()
}

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('Test')
  return store
}

function insertNode(store: SqliteStore, fields: Partial<GraphNode> & { type: string; title: string }): GraphNode {
  const node: GraphNode = {
    id: generateId('node'),
    type: fields.type as never,
    title: fields.title,
    status: (fields.status as never) ?? 'backlog',
    priority: fields.priority ?? 3,
    parentId: fields.parentId,
    createdAt: now(),
    updatedAt: now(),
  }
  store.insertNode(node)
  return node
}

function addImplementsEdge(store: SqliteStore, fromId: string, toId: string): void {
  store.insertEdge({ id: generateId('edge'), from: fromId, to: toId, relationType: 'implements', createdAt: now() })
}

describe('AC1: contract with single implementer task → done closes contract', () => {
  it('transitions contract to satisfied when its single implementing task is done', () => {
    const store = makeStore()
    const contract = insertNode(store, { type: 'contract', title: 'Auth Contract' })
    const task = insertNode(store, { type: 'task', title: 'Implement Auth', status: 'done' })
    addImplementsEdge(store, task.id, contract.id)

    closeSpecOnImplementerDone(store, task.id)

    const updated = store.getNodeById(contract.id)!
    expect(updated.status).toBe('satisfied')
  })

  it('returns list of closed spec node ids', () => {
    const store = makeStore()
    const contract = insertNode(store, { type: 'contract', title: 'Contract A' })
    const task = insertNode(store, { type: 'task', title: 'Task A', status: 'done' })
    addImplementsEdge(store, task.id, contract.id)

    const result = closeSpecOnImplementerDone(store, task.id)

    expect(result.closed).toContain(contract.id)
  })
})

describe('AC2: requirement with multiple implementers — all-or-nothing close', () => {
  it('closes requirement only when ALL implementing tasks are done', () => {
    const store = makeStore()
    const req = insertNode(store, { type: 'requirement', title: 'Auth Req' })
    const task1 = insertNode(store, { type: 'task', title: 'Task 1', status: 'done' })
    const task2 = insertNode(store, { type: 'task', title: 'Task 2', status: 'done' })
    addImplementsEdge(store, task1.id, req.id)
    addImplementsEdge(store, task2.id, req.id)

    closeSpecOnImplementerDone(store, task1.id)

    const updated = store.getNodeById(req.id)!
    expect(updated.status).toBe('satisfied')
  })

  it('keeps requirement open when some implementers are still pending', () => {
    const store = makeStore()
    const req = insertNode(store, { type: 'requirement', title: 'Pending Req' })
    const task1 = insertNode(store, { type: 'task', title: 'Task Done', status: 'done' })
    const task2 = insertNode(store, { type: 'task', title: 'Task Pending', status: 'in_progress' })
    addImplementsEdge(store, task1.id, req.id)
    addImplementsEdge(store, task2.id, req.id)

    closeSpecOnImplementerDone(store, task1.id)

    const updated = store.getNodeById(req.id)!
    expect(updated.status).not.toBe('satisfied')
  })
})

describe('AC3: spec without implementer stays untouched', () => {
  it('does not close orphan spec nodes', () => {
    const store = makeStore()
    const orphanReq = insertNode(store, { type: 'requirement', title: 'Orphan' })
    const task = insertNode(store, { type: 'task', title: 'Unrelated Task', status: 'done' })
    // No edge from task to orphanReq

    closeSpecOnImplementerDone(store, task.id)

    const unchanged = store.getNodeById(orphanReq.id)!
    expect(unchanged.status).toBe('backlog')
  })
})

describe('AC4: parent-scoped specs (acceptance_criteria) close when their parent is done', () => {
  it('satisfies an acceptance_criteria when its parent task is done', () => {
    const store = makeStore()
    const task = insertNode(store, { type: 'task', title: 'Login', status: 'done' })
    const ac = insertNode(store, { type: 'acceptance_criteria', title: 'returns 200', parentId: task.id })

    const result = closeSpecOnImplementerDone(store, task.id)

    expect(store.getNodeById(ac.id)!.status).toBe('satisfied')
    expect(result.closed).toContain(ac.id)
  })

  it('does not close an AC whose parent is NOT the done task', () => {
    const store = makeStore()
    const otherTask = insertNode(store, { type: 'task', title: 'Other', status: 'done' })
    const task = insertNode(store, { type: 'task', title: 'Owner', status: 'in_progress' })
    const ac = insertNode(store, { type: 'acceptance_criteria', title: 'AC', parentId: task.id })

    closeSpecOnImplementerDone(store, otherTask.id)

    expect(store.getNodeById(ac.id)!.status).toBe('backlog')
  })
})

describe('backfillSatisfiedSpecs: drains legacy spec-node pollution', () => {
  it('satisfies backlog specs whose parent/implementers are already done, idempotently', () => {
    const store = makeStore()
    const doneTask = insertNode(store, { type: 'task', title: 'Done', status: 'done' })
    const ac = insertNode(store, { type: 'acceptance_criteria', title: 'AC', parentId: doneTask.id })
    const constraint = insertNode(store, { type: 'constraint', title: 'C', parentId: doneTask.id })
    const openTask = insertNode(store, { type: 'task', title: 'Open', status: 'in_progress' })
    const openAc = insertNode(store, { type: 'acceptance_criteria', title: 'Open AC', parentId: openTask.id })

    const first = backfillSatisfiedSpecs(store)
    expect(first.closed).toEqual(expect.arrayContaining([ac.id, constraint.id]))
    expect(store.getNodeById(ac.id)!.status).toBe('satisfied')
    expect(store.getNodeById(openAc.id)!.status).toBe('backlog') // parent not done

    // idempotent: a second run closes nothing more
    expect(backfillSatisfiedSpecs(store).closed).toEqual([])
  })
})
