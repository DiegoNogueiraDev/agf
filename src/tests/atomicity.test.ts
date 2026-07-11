import { describe, it, expect } from 'vitest'
import { nonAtomicTasks, isAtomic } from '../core/planner/atomicity.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: GraphDocument['nodes'] = []): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes,
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

describe('nonAtomicTasks', () => {
  it('returns empty array for empty doc', () => {
    expect(nonAtomicTasks(makeDoc())).toEqual([])
  })

  it('returns array', () => {
    const doc = makeDoc([
      { id: 't1', type: 'task', title: 'Simple task', status: 'backlog', priority: 2, createdAt: '', updatedAt: '' },
    ])
    expect(Array.isArray(nonAtomicTasks(doc))).toBe(true)
  })
})

describe('isAtomic', () => {
  it('small task is atomic', () => {
    const doc = makeDoc([
      {
        id: 't1',
        type: 'task',
        title: 'Small task',
        status: 'backlog',
        priority: 2,
        estimateMinutes: 30,
        createdAt: '',
        updatedAt: '',
      },
    ])
    expect(isAtomic(doc, 't1')).toBe(true)
  })

  it('nonexistent node is atomic (not flagged)', () => {
    const doc = makeDoc()
    expect(isAtomic(doc, 'missing-id')).toBe(true)
  })
})
