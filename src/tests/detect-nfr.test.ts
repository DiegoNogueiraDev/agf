import { describe, it, expect } from 'vitest'
import { detectNfr } from '../core/gaps/detect-nfr.js'
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

describe('detectNfr', () => {
  it('returns empty array for empty doc', () => {
    expect(detectNfr(makeDoc())).toEqual([])
  })

  it('returns array', () => {
    expect(Array.isArray(detectNfr(makeDoc()))).toBe(true)
  })

  it('each gap has kind and severity when returned', () => {
    const gaps = detectNfr(makeDoc())
    for (const gap of gaps) {
      expect(typeof gap.kind).toBe('string')
      expect(['required', 'recommended']).toContain(gap.severity)
    }
  })
})
