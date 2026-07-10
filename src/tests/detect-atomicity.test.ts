import { describe, it, expect } from 'vitest'
import { detectAtomicity } from '../core/gaps/detect-atomicity.js'
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

describe('detectAtomicity', () => {
  it('returns empty array for empty doc', () => {
    expect(detectAtomicity(makeDoc())).toEqual([])
  })

  it('returns array', () => {
    const doc = makeDoc([
      { id: 't1', type: 'task', title: 'Task', status: 'backlog', priority: 2, createdAt: '', updatedAt: '' },
    ])
    expect(Array.isArray(detectAtomicity(doc))).toBe(true)
  })
})
