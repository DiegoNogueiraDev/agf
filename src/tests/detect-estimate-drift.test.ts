import { describe, it, expect } from 'vitest'
import { detectEstimateDrift } from '../core/gaps/detect-estimate-drift.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: GraphDocument['nodes'] = [], edges: GraphDocument['edges'] = []): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes,
    edges,
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

describe('detectEstimateDrift', () => {
  it('returns empty array for empty doc', () => {
    expect(detectEstimateDrift(makeDoc())).toEqual([])
  })

  it('returns array', () => {
    expect(Array.isArray(detectEstimateDrift(makeDoc()))).toBe(true)
  })
})
