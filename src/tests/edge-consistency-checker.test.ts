import { describe, it, expect } from 'vitest'
import { checkEdgeConsistency } from '../core/validator/edge-consistency-checker.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(
  nodes: Array<{ id: string; type?: string }>,
  edges: Array<{ id: string; from: string; to: string; relationType: string }>,
): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'task',
      status: 'backlog',
      title: `Node ${n.id}`,
      priority: 3,
      createdAt: '2026-06-23T00:00:00Z',
      updatedAt: '2026-06-23T00:00:00Z',
      acceptanceCriteria: [],
      blocked: false,
      metadata: {},
    })),
    edges: edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      relationType: e.relationType,
      createdAt: '2026-06-23T00:00:00Z',
    })),
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  } as unknown as GraphDocument
}

describe('checkEdgeConsistency', () => {
  it('returns a report object', () => {
    const result = checkEdgeConsistency(makeDoc([], []))
    expect(typeof result).toBe('object')
    expect(Array.isArray(result.issues)).toBe(true)
  })

  it('returns no issues for empty graph', () => {
    expect(checkEdgeConsistency(makeDoc([], [])).issues).toHaveLength(0)
  })

  it('detects self-loop', () => {
    const doc = makeDoc([{ id: 'n1' }], [{ id: 'e1', from: 'n1', to: 'n1', relationType: 'depends_on' }])
    const issues = checkEdgeConsistency(doc).issues
    expect(issues.some((i) => i.issueType === 'self_loop')).toBe(true)
  })

  it('detects redundant inverse (depends_on + blocks)', () => {
    const doc = makeDoc(
      [{ id: 'a' }, { id: 'b' }],
      [
        { id: 'e1', from: 'a', to: 'b', relationType: 'depends_on' },
        { id: 'e2', from: 'b', to: 'a', relationType: 'blocks' },
      ],
    )
    const issues = checkEdgeConsistency(doc).issues
    expect(issues.some((i) => i.issueType === 'redundant_inverse')).toBe(true)
  })

  it('no issues for clean depends_on edge', () => {
    const doc = makeDoc([{ id: 'a' }, { id: 'b' }], [{ id: 'e1', from: 'a', to: 'b', relationType: 'depends_on' }])
    expect(checkEdgeConsistency(doc).issues).toHaveLength(0)
  })

  it('each issue has edgeId and issueType', () => {
    const doc = makeDoc([{ id: 'n1' }], [{ id: 'e1', from: 'n1', to: 'n1', relationType: 'depends_on' }])
    const issue = checkEdgeConsistency(doc).issues[0]
    expect(typeof issue.edgeId).toBe('string')
    expect(typeof issue.issueType).toBe('string')
  })
})
