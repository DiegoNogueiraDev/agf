/*!
 * Tests for auto-decompose.ts — autoDecomposeLarge and persistDecomposition.
 *
 * Uses in-memory SqliteStore (no I/O, no LLM). smartDecompose is pure logic
 * that splits ACs into subtasks — no mocking needed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { autoDecomposeLarge, persistDecomposition } from '../core/planner/auto-decompose.js'
import type { GraphNode } from '../core/graph/graph-types.js'
import type { DecomposeResult } from '../core/planner/smart-decompose.js'

function makeStore(): SqliteStore {
  const s = SqliteStore.open(':memory:')
  s.initProject('test')
  return s
}

function makeTask(overrides: Partial<GraphNode> = {}): GraphNode {
  const ts = new Date().toISOString()
  return {
    id: 'node_test_task',
    title: 'Test large task',
    type: 'task',
    status: 'backlog',
    priority: 2,
    acceptanceCriteria: [],
    tags: [],
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  } as GraphNode
}

describe('autoDecomposeLarge — empty store', () => {
  let store: SqliteStore
  beforeEach(() => {
    store = makeStore()
  })
  afterEach(() => store.close())

  it('returns empty decomposed and skipped when no tasks exist', () => {
    const result = autoDecomposeLarge(store)
    expect(result.decomposed).toHaveLength(0)
    expect(result.skipped).toHaveLength(0)
  })
})

describe('autoDecomposeLarge — skip cases', () => {
  let store: SqliteStore
  beforeEach(() => {
    store = makeStore()
  })
  afterEach(() => store.close())

  it('silently ignores S-sized tasks (below threshold)', () => {
    store.insertNode(makeTask({ id: 'node_small', xpSize: 'S', acceptanceCriteria: ['AC1', 'AC2'] }))
    const result = autoDecomposeLarge(store)
    expect(result.decomposed).toHaveLength(0)
    expect(result.skipped).toHaveLength(0)
  })

  it('silently ignores M-sized tasks (below threshold)', () => {
    store.insertNode(makeTask({ id: 'node_medium', xpSize: 'M', acceptanceCriteria: ['AC1', 'AC2'] }))
    const result = autoDecomposeLarge(store)
    expect(result.decomposed).toHaveLength(0)
    expect(result.skipped).toHaveLength(0)
  })

  it('skips L-sized task with existing children', () => {
    store.insertNode(makeTask({ id: 'node_parent', xpSize: 'L', acceptanceCriteria: ['AC1', 'AC2'] }))
    const ts = new Date().toISOString()
    store.insertNode({
      id: 'node_child',
      title: 'Existing child',
      type: 'subtask',
      status: 'backlog',
      priority: 3,
      parentId: 'node_parent',
      acceptanceCriteria: [],
      tags: [],
      createdAt: ts,
      updatedAt: ts,
    } as GraphNode)

    const result = autoDecomposeLarge(store)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toBe('has_children')
  })

  it('skips L-sized task with insufficient ACs (0 ACs)', () => {
    store.insertNode(makeTask({ id: 'node_no_ac', xpSize: 'L', acceptanceCriteria: [] }))
    const result = autoDecomposeLarge(store)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toBe('insufficient_acs')
  })

  it('skips L-sized task with insufficient ACs (1 AC)', () => {
    store.insertNode(makeTask({ id: 'node_one_ac', xpSize: 'L', acceptanceCriteria: ['Only one AC'] }))
    const result = autoDecomposeLarge(store)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toBe('insufficient_acs')
  })

  it('skips L-sized task with too many ACs (> maxSubtasks)', () => {
    const manyACs = Array.from({ length: 9 }, (_, i) => `AC${i + 1}`)
    store.insertNode(makeTask({ id: 'node_many_ac', xpSize: 'L', acceptanceCriteria: manyACs }))
    const result = autoDecomposeLarge(store, { maxSubtasks: 8 })
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toBe('too_many_acs')
  })
})

describe('autoDecomposeLarge — success path', () => {
  let store: SqliteStore
  beforeEach(() => {
    store = makeStore()
  })
  afterEach(() => store.close())

  it('decomposes L-sized task with 2 ACs into subtasks', () => {
    store.insertNode(
      makeTask({
        id: 'node_large',
        xpSize: 'L',
        acceptanceCriteria: [
          'GIVEN X WHEN Y THEN renders login form',
          'GIVEN valid creds WHEN submitted THEN redirects to dashboard',
        ],
      }),
    )
    const result = autoDecomposeLarge(store)
    expect(result.decomposed).toHaveLength(1)
    expect(result.decomposed[0].parentId).toBe('node_large')
    expect(result.decomposed[0].subtaskIds.length).toBeGreaterThan(0)
  })

  it('decomposed subtasks are persisted in the store', () => {
    store.insertNode(
      makeTask({
        id: 'node_large_2',
        xpSize: 'L',
        acceptanceCriteria: ['AC1: unit test passes', 'AC2: integration test passes', 'AC3: lint clean'],
      }),
    )
    const result = autoDecomposeLarge(store)
    expect(result.decomposed).toHaveLength(1)

    const doc = store.toGraphDocument()
    const subtasks = doc.nodes.filter((n) => n.type === 'subtask')
    expect(subtasks.length).toBeGreaterThan(0)
  })
})

describe('persistDecomposition', () => {
  let store: SqliteStore
  beforeEach(() => {
    store = makeStore()
    store.insertNode(makeTask({ id: 'node_parent_persist' }))
  })
  afterEach(() => store.close())

  it('inserts subtask nodes for each subtask in result', () => {
    const result: DecomposeResult = {
      parentId: 'node_parent_persist',
      subtasks: [
        { title: 'Write unit test', acceptanceCriteria: ['test passes'], estimateMinutes: 30, testType: 'unit' },
        {
          title: 'Implement function',
          acceptanceCriteria: ['function returns correct value'],
          estimateMinutes: 45,
          testType: 'unit',
        },
      ],
      edges: [],
    }

    const persisted = persistDecomposition(store, result)
    expect(persisted.createdNodeIds).toHaveLength(2)

    const doc = store.toGraphDocument()
    const subtasks = doc.nodes.filter((n) => n.type === 'subtask' && n.parentId === 'node_parent_persist')
    expect(subtasks).toHaveLength(2)
  })

  it('returns empty arrays for empty subtasks', () => {
    const result: DecomposeResult = {
      parentId: 'node_parent_persist',
      subtasks: [],
      edges: [],
    }

    const persisted = persistDecomposition(store, result)
    expect(persisted.createdNodeIds).toHaveLength(0)
    expect(persisted.createdEdgeCount).toBe(0)
  })

  it('creates edges between subtasks when edges are specified', () => {
    const result: DecomposeResult = {
      parentId: 'node_parent_persist',
      subtasks: [
        { title: 'Step 1', acceptanceCriteria: ['done'], estimateMinutes: 30, testType: 'unit' },
        { title: 'Step 2', acceptanceCriteria: ['done'], estimateMinutes: 30, testType: 'unit' },
      ],
      edges: [{ from: 'provisional-0', to: 'provisional-1', relationType: 'depends_on' }],
    }

    const persisted = persistDecomposition(store, result)
    expect(persisted.createdNodeIds).toHaveLength(2)
    expect(persisted.createdEdgeCount).toBe(1)
  })
})
