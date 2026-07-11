/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { runSyntheticValidation } from '../core/harness/synthetic-validation-gate.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function createMockStore(doc: GraphDocument | null): SqliteStore {
  return {
    toGraphDocument: () => {
      if (!doc) throw new Error('GraphNotInitializedError')
      return doc
    },
  } as unknown as SqliteStore
}

function makeDoc(overrides: Partial<GraphDocument> = {}): GraphDocument {
  return {
    version: '1.0.0',
    project: { id: 'p1', name: 'test', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
    nodes: [],
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
    ...overrides,
  }
}

describe('synthetic-validation-gate', () => {
  it('should return passed=true with score 100 when graph has no nodes', () => {
    const store = createMockStore(makeDoc({ nodes: [], edges: [] }))
    const result = runSyntheticValidation(store)
    expect(result.passed).toBe(true)
    expect(result.score).toBe(100)
    expect(result.mutationsApplied).toBe(0)
  })

  it('should detect dangling edges', () => {
    const doc = makeDoc({
      nodes: [
        {
          id: 'n1',
          type: 'task',
          title: 'Task 1',
          status: 'backlog',
          priority: 3,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ],
      edges: [],
    })
    const store = createMockStore(doc)
    const result = runSyntheticValidation(store)
    const dangling = result.mutations.find((m) => m.type === 'dangling_edge')
    expect(dangling).toBeDefined()
    expect(dangling!.detected).toBe(true)
  })

  it('should detect self-cycles', () => {
    const doc = makeDoc({
      nodes: [
        {
          id: 'n1',
          type: 'task',
          title: 'Task 1',
          status: 'backlog',
          priority: 3,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ],
      edges: [],
    })
    const store = createMockStore(doc)
    const result = runSyntheticValidation(store)
    const selfCycle = result.mutations.find((m) => m.type === 'self_cycle')
    expect(selfCycle).toBeDefined()
    expect(selfCycle!.detected).toBe(true)
  })

  it('should detect status regressions when nodes are done', () => {
    const doc = makeDoc({
      nodes: [
        {
          id: 'n1',
          type: 'task',
          title: 'Done Task',
          status: 'done',
          priority: 3,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          metadata: { previousStatus: 'done' },
        },
      ],
      edges: [],
    })
    const store = createMockStore(doc)
    const result = runSyntheticValidation(store)
    const regression = result.mutations.find((m) => m.type === 'status_regression')
    expect(regression).toBeDefined()
  })

  it('should skip status regression check when no nodes are done', () => {
    const doc = makeDoc({
      nodes: [
        {
          id: 'n1',
          type: 'task',
          title: 'Task 1',
          status: 'backlog',
          priority: 3,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ],
      edges: [],
    })
    const store = createMockStore(doc)
    const result = runSyntheticValidation(store)
    const regression = result.mutations.find((m) => m.type === 'status_regression')
    expect(regression).toBeUndefined()
  })

  it('should report correct score based on detection rate', () => {
    const doc = makeDoc({
      nodes: [
        {
          id: 'n1',
          type: 'task',
          title: 'Task 1',
          status: 'backlog',
          priority: 3,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ],
      edges: [],
    })
    const store = createMockStore(doc)
    const result = runSyntheticValidation(store)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(result.mutationsApplied).toBeGreaterThan(0)
  })
})
