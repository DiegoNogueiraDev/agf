import { describe, it, expect } from 'vitest'
import { significantTokens, verifyAcCoverage, decomposedParents } from '../core/planner/ac-coverage.js'
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

describe('significantTokens', () => {
  it('returns array of significant tokens', () => {
    const tokens = significantTokens('system returns status 200 when authenticated')
    expect(Array.isArray(tokens)).toBe(true)
    expect(tokens.length).toBeGreaterThan(0)
  })

  it('filters out stopwords', () => {
    const tokens = significantTokens('this will have that with from')
    expect(tokens).not.toContain('this')
    expect(tokens).not.toContain('will')
    expect(tokens).not.toContain('that')
  })

  it('filters tokens shorter than 4 chars', () => {
    const tokens = significantTokens('the an of is it')
    expect(tokens).toEqual([])
  })

  it('normalizes to lowercase', () => {
    const tokens = significantTokens('System Returns Status')
    for (const t of tokens) {
      expect(t).toBe(t.toLowerCase())
    }
  })
})

describe('verifyAcCoverage', () => {
  it('returns 100% coverage for parent with no AC', () => {
    const doc = makeDoc([
      { id: 'p1', type: 'task', title: 'Parent', status: 'backlog', priority: 2, createdAt: '', updatedAt: '' },
    ])
    const result = verifyAcCoverage(doc, 'p1')
    expect(result.coverage).toBe(100)
    expect(result.uncoveredAcs).toEqual([])
  })

  it('parentId not in doc returns empty result', () => {
    const doc = makeDoc()
    const result = verifyAcCoverage(doc, 'nonexistent')
    expect(result.coverage).toBe(100)
  })
})

describe('decomposedParents', () => {
  it('returns array', () => {
    const doc = makeDoc()
    expect(Array.isArray(decomposedParents(doc))).toBe(true)
  })

  it('returns empty for doc with no task nodes', () => {
    const doc = makeDoc()
    expect(decomposedParents(doc)).toEqual([])
  })
})
