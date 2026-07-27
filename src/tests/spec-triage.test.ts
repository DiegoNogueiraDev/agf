/*!
 * TDD: agf spec triage — triage orphan spec-nodes (requirement/interface/contract).
 *
 * AC1: Given 19 requirements sans implementer, When triage runs, Then lists them
 *      with applyVia (promote → creates task + implements edge, or close → archives).
 * AC2: Given an orphan interface, When promote, Then creates a consuming task + edge.
 * AC3: Given an orphan interface, When close, Then archives the interface node (done).
 * AC4: Dry-run (default) lists orphans without mutating.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { generateId } from '../core/utils/id.js'
import { triageSpecNodes, type SpecTriageOptions } from '../core/risk/spec-triage.js'
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
    tags: fields.tags,
  }
  store.insertNode(node)
  return node
}

describe('AC4: dry-run lists orphan spec-nodes without mutation', () => {
  it('returns orphan requirements in dry-run mode', () => {
    const store = makeStore()
    const req = insertNode(store, { type: 'requirement', title: 'Req without implementer' })

    const result = triageSpecNodes(store, { dryRun: true })

    expect(result.orphans.length).toBeGreaterThan(0)
    expect(result.orphans.some((o) => o.id === req.id)).toBe(true)
    expect(result.promoted).toHaveLength(0)
    expect(result.closed).toHaveLength(0)
  })

  it('does not list requirements that already have an implements edge', () => {
    const store = makeStore()
    const req = insertNode(store, { type: 'requirement', title: 'Linked Req' })
    const task = insertNode(store, { type: 'task', title: 'Task that implements' })
    store.insertEdge({
      id: generateId('edge'),
      from: task.id,
      to: req.id,
      relationType: 'implements',
      weight: 1,
      createdAt: now(),
    })

    const result = triageSpecNodes(store, { dryRun: true })

    expect(result.orphans.some((o) => o.id === req.id)).toBe(false)
  })

  it('lists orphan interface nodes', () => {
    const store = makeStore()
    const iface = insertNode(store, { type: 'interface', title: 'IRepo without consumer' })

    const result = triageSpecNodes(store, { dryRun: true })

    expect(result.orphans.some((o) => o.id === iface.id)).toBe(true)
  })
})

describe('AC2: promote creates consuming task + implements edge', () => {
  it('creates task + edge when promote is given', () => {
    const store = makeStore()
    const req = insertNode(store, { type: 'requirement', title: 'Need fast checkout' })

    const result = triageSpecNodes(store, { dryRun: false, promote: [req.id] })

    expect(result.promoted).toContain(req.id)

    const doc = store.toGraphDocument()
    const tasks = doc.nodes.filter((n) => n.type === 'task')
    expect(tasks.length).toBeGreaterThan(0)

    const edge = doc.edges.find((e) => e.to === req.id && e.relationType === 'implements')
    expect(edge).toBeDefined()
  })
})

describe('AC3: close archives the spec node', () => {
  it('archives an interface node when close is given', () => {
    const store = makeStore()
    const iface = insertNode(store, { type: 'interface', title: 'Obsolete interface' })

    const result = triageSpecNodes(store, { dryRun: false, close: [iface.id] })

    expect(result.closed).toContain(iface.id)
    // Node should be archived (soft-deleted, status done or node gone)
    const archived = store.getNodeById(iface.id)
    // Either archived or status moved to done
    const isDone = archived?.status === 'done'
    const isGone = archived === null
    expect(isDone || isGone).toBe(true)
  })
})
