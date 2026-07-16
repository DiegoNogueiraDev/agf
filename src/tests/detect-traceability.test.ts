import { describe, it, expect } from 'vitest'
import { detectTraceability } from '../core/gaps/detect-traceability.js'
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

describe('detectTraceability', () => {
  it('returns empty array for empty doc', () => {
    expect(detectTraceability(makeDoc())).toEqual([])
  })

  it('returns array', () => {
    expect(Array.isArray(detectTraceability(makeDoc()))).toBe(true)
  })
})
