import { describe, it, expect } from 'vitest'
import { detectDesignDrift } from '../core/gaps/detect-design-drift.js'
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

describe('detectDesignDrift', () => {
  it('returns empty array for empty doc', () => {
    expect(detectDesignDrift(makeDoc())).toEqual([])
  })

  it('returns array', () => {
    expect(Array.isArray(detectDesignDrift(makeDoc()))).toBe(true)
  })

  it('each gap has required fields', () => {
    const gaps = detectDesignDrift(makeDoc())
    for (const gap of gaps) {
      expect(typeof gap.kind).toBe('string')
      expect(typeof gap.evidence).toBe('string')
    }
  })
})
