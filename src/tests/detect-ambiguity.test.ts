import { describe, it, expect } from 'vitest'
import { detectAmbiguity } from '../core/gaps/detect-ambiguity.js'
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

describe('detectAmbiguity', () => {
  it('returns empty array for empty doc', () => {
    expect(detectAmbiguity(makeDoc())).toEqual([])
  })

  it('returns array', () => {
    const doc = makeDoc([
      { id: 't1', type: 'task', title: 'Task', status: 'backlog', priority: 2, createdAt: '', updatedAt: '' },
    ])
    expect(Array.isArray(detectAmbiguity(doc))).toBe(true)
  })

  it('each gap has kind and severity', () => {
    const doc = makeDoc([
      {
        id: 't1',
        type: 'task',
        title: 'Task',
        status: 'backlog',
        priority: 2,
        acceptanceCriteria: ['should work properly'],
        createdAt: '',
        updatedAt: '',
      },
    ])
    const gaps = detectAmbiguity(doc)
    for (const gap of gaps) {
      expect(typeof gap.kind).toBe('string')
      expect(typeof gap.severity).toBe('string')
    }
  })
})
