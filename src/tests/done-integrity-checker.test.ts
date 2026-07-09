import { describe, it, expect } from 'vitest'
import { checkDoneIntegrity } from '../core/validator/done-integrity-checker.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(
  nodes: Array<{ id: string; type?: string; status: string; blocked?: boolean }>,
  edges: Array<{ id: string; from: string; to: string; relationType: string }> = [],
): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'task',
      status: n.status,
      title: `Task ${n.id}`,
      priority: 3,
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-23T00:00:00Z',
      acceptanceCriteria: [],
      blocked: n.blocked ?? false,
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

describe('checkDoneIntegrity', () => {
  it('returns a DoneIntegrityReport object', () => {
    const result = checkDoneIntegrity(makeDoc([]))
    expect(typeof result).toBe('object')
    expect(Array.isArray(result.issues)).toBe(true)
    expect(typeof result.passed).toBe('boolean')
  })

  it('passes vacuously for empty graph', () => {
    const result = checkDoneIntegrity(makeDoc([]))
    expect(result.passed).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('passes when done task has no issues', () => {
    const doc = makeDoc([{ id: 't1', status: 'done', blocked: false }])
    expect(checkDoneIntegrity(doc).passed).toBe(true)
  })

  it('detects blocked_but_done', () => {
    const doc = makeDoc([{ id: 't1', status: 'done', blocked: true }])
    const result = checkDoneIntegrity(doc)
    expect(result.passed).toBe(false)
    expect(result.issues.some((i) => i.issueType === 'blocked_but_done')).toBe(true)
  })

  it('detects dependency_not_done', () => {
    const doc = makeDoc(
      [
        { id: 'done1', status: 'done' },
        { id: 'pending', status: 'in_progress' },
      ],
      [{ id: 'e1', from: 'done1', to: 'pending', relationType: 'depends_on' }],
    )
    const result = checkDoneIntegrity(doc)
    expect(result.passed).toBe(false)
    expect(result.issues.some((i) => i.issueType === 'dependency_not_done')).toBe(true)
  })

  it('no issue when done task depends on another done task', () => {
    const doc = makeDoc(
      [
        { id: 'done1', status: 'done' },
        { id: 'done2', status: 'done' },
      ],
      [{ id: 'e1', from: 'done1', to: 'done2', relationType: 'depends_on' }],
    )
    expect(checkDoneIntegrity(doc).passed).toBe(true)
  })

  it('issue has nodeId and issueType', () => {
    const doc = makeDoc([{ id: 't1', status: 'done', blocked: true }])
    const issue = checkDoneIntegrity(doc).issues[0]
    expect(typeof issue.nodeId).toBe('string')
    expect(typeof issue.issueType).toBe('string')
  })
})
