import { describe, it, expect } from 'vitest'
import { detectEdgeCases } from '../core/gaps/detect-edge-cases.js'
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

describe('detectEdgeCases', () => {
  it('returns empty array for empty doc', () => {
    expect(detectEdgeCases(makeDoc())).toEqual([])
  })

  it('returns array', () => {
    expect(Array.isArray(detectEdgeCases(makeDoc()))).toBe(true)
  })
})
