/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { getNodeAcTexts, getNodeAcFromStore, nodeHasAc } from '../core/utils/ac-helpers.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'

function makeDoc(nodes: GraphNode[]): GraphDocument {
  return {
    version: '1',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes,
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

const baseTime = '2026-01-01T00:00:00.000Z'

function makeNode(
  overrides: Partial<GraphNode> & { id: string; type: GraphNode['type']; title: string; status: GraphNode['status'] },
): GraphNode {
  return {
    priority: 3 as const,
    parentId: null,
    createdAt: baseTime,
    updatedAt: baseTime,
    ...overrides,
  } as GraphNode
}

describe('getNodeAcTexts', () => {
  it('returns inline AC when present', () => {
    const node = makeNode({
      id: 't1',
      type: 'task',
      title: 'Test task',
      status: 'backlog',
      acceptanceCriteria: ['AC1', 'AC2'],
    })
    const doc = makeDoc([node])
    expect(getNodeAcTexts(doc, 't1')).toEqual(['AC1', 'AC2'])
  })

  it('falls back to child AC node titles when no inline AC', () => {
    const task = makeNode({ id: 't1', type: 'task', title: 'Task', status: 'backlog', acceptanceCriteria: undefined })
    const ac1 = makeNode({
      id: 'ac1',
      type: 'acceptance_criteria',
      title: 'System does X',
      status: 'done',
      parentId: 't1',
    })
    const ac2 = makeNode({
      id: 'ac2',
      type: 'acceptance_criteria',
      title: 'System does Y',
      status: 'done',
      parentId: 't1',
    })
    const doc = makeDoc([task, ac1, ac2])
    expect(getNodeAcTexts(doc, 't1')).toEqual(['System does X', 'System does Y'])
  })

  it('returns empty array for unknown node', () => {
    const doc = makeDoc([])
    expect(getNodeAcTexts(doc, 'nonexistent')).toEqual([])
  })

  it('returns empty array when node has no AC at all', () => {
    const node = makeNode({ id: 't1', type: 'task', title: 'No AC', status: 'backlog' })
    const doc = makeDoc([node])
    expect(getNodeAcTexts(doc, 't1')).toEqual([])
  })

  it('prefers inline AC even when child AC nodes also exist', () => {
    const task = makeNode({
      id: 't1',
      type: 'task',
      title: 'Task',
      status: 'backlog',
      acceptanceCriteria: ['Inline AC'],
    })
    const ac1 = makeNode({ id: 'ac1', type: 'acceptance_criteria', title: 'Child AC', status: 'done', parentId: 't1' })
    const doc = makeDoc([task, ac1])
    expect(getNodeAcTexts(doc, 't1')).toEqual(['Inline AC'])
  })
})

describe('getNodeAcFromStore', () => {
  it('returns inline AC from store node', () => {
    const store = {
      getNodeById: (id: string) => {
        if (id === 't1')
          return makeNode({
            id: 't1',
            type: 'task',
            title: 'Test',
            status: 'backlog',
            acceptanceCriteria: ['Store AC1'],
          })
        return null
      },
      getChildNodes: () => [],
    } as unknown as SqliteStore
    expect(getNodeAcFromStore(store, 't1')).toEqual(['Store AC1'])
  })

  it('falls back to child AC nodes via store', () => {
    const store = {
      getNodeById: (id: string) => {
        if (id === 't1') return makeNode({ id: 't1', type: 'task', title: 'Test', status: 'backlog' })
        return null
      },
      getChildNodes: () => [
        makeNode({ id: 'ac1', type: 'acceptance_criteria', title: 'AC from store', status: 'done', parentId: 't1' }),
      ],
    } as unknown as SqliteStore
    expect(getNodeAcFromStore(store, 't1')).toEqual(['AC from store'])
  })

  it('returns empty when node not found', () => {
    const store = {
      getNodeById: () => null,
      getChildNodes: () => [],
    } as unknown as SqliteStore
    expect(getNodeAcFromStore(store, 'ghost')).toEqual([])
  })

  it('filters to only acceptance_criteria child types', () => {
    const store = {
      getNodeById: (id: string) => {
        if (id === 't1') return makeNode({ id: 't1', type: 'task', title: 'Test', status: 'backlog' })
        return null
      },
      getChildNodes: () => [
        makeNode({ id: 'ac1', type: 'acceptance_criteria', title: 'Real AC', status: 'done', parentId: 't1' }),
        makeNode({ id: 's1', type: 'subtask', title: 'Some subtask', status: 'in_progress', parentId: 't1' }),
      ],
    } as unknown as SqliteStore
    expect(getNodeAcFromStore(store, 't1')).toEqual(['Real AC'])
  })
})

describe('nodeHasAc', () => {
  it('returns true when node has inline AC', () => {
    const node = makeNode({ id: 't1', type: 'task', title: 'Test', status: 'backlog', acceptanceCriteria: ['AC'] })
    const doc = makeDoc([node])
    expect(nodeHasAc(doc, 't1')).toBe(true)
  })

  it('returns true when node has child AC nodes', () => {
    const task = makeNode({ id: 't1', type: 'task', title: 'Test', status: 'backlog' })
    const ac = makeNode({ id: 'ac1', type: 'acceptance_criteria', title: 'Child AC', status: 'done', parentId: 't1' })
    const doc = makeDoc([task, ac])
    expect(nodeHasAc(doc, 't1')).toBe(true)
  })

  it('returns false when node has no AC', () => {
    const node = makeNode({ id: 't1', type: 'task', title: 'No AC', status: 'backlog' })
    const doc = makeDoc([node])
    expect(nodeHasAc(doc, 't1')).toBe(false)
  })

  it('returns false for unknown node', () => {
    const doc = makeDoc([])
    expect(nodeHasAc(doc, 'ghost')).toBe(false)
  })
})
