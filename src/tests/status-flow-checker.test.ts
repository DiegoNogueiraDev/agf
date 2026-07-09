import { describe, it, expect } from 'vitest'
import { checkStatusFlow } from '../core/validator/status-flow-checker.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(
  nodes: Array<{ id: string; type: string; status: string; createdAt?: string; updatedAt?: string }>,
): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      status: n.status,
      title: `Task ${n.id}`,
      priority: 3,
      createdAt: n.createdAt ?? '2026-06-01T00:00:00Z',
      updatedAt: n.updatedAt ?? '2026-06-23T00:00:00Z',
      acceptanceCriteria: [],
      blocked: false,
      metadata: {},
    })),
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  } as unknown as GraphDocument
}

describe('checkStatusFlow', () => {
  it('returns a StatusFlowReport object', () => {
    const result = checkStatusFlow(makeDoc([]))
    expect(typeof result).toBe('object')
    expect(Array.isArray(result.violations)).toBe(true)
    expect(typeof result.complianceRate).toBe('number')
  })

  it('returns 100% compliance for empty graph', () => {
    expect(checkStatusFlow(makeDoc([])).complianceRate).toBe(100)
  })

  it('returns 100% compliance for no done tasks', () => {
    const doc = makeDoc([{ id: 't1', type: 'task', status: 'in_progress' }])
    expect(checkStatusFlow(doc).complianceRate).toBe(100)
    expect(checkStatusFlow(doc).violations).toHaveLength(0)
  })

  it('detects violation when done task has createdAt === updatedAt', () => {
    const ts = '2026-06-23T00:00:00Z'
    const doc = makeDoc([{ id: 't1', type: 'task', status: 'done', createdAt: ts, updatedAt: ts }])
    const result = checkStatusFlow(doc)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].nodeId).toBe('t1')
  })

  it('no violation when done task has different createdAt and updatedAt', () => {
    const doc = makeDoc([
      {
        id: 't1',
        type: 'task',
        status: 'done',
        createdAt: '2026-06-01T00:00:00Z',
        updatedAt: '2026-06-23T00:00:00Z',
      },
    ])
    expect(checkStatusFlow(doc).violations).toHaveLength(0)
  })

  it('compliance rate decreases with violations', () => {
    const ts = '2026-06-01T00:00:00Z'
    const doc = makeDoc([
      { id: 't1', type: 'task', status: 'done', createdAt: ts, updatedAt: ts },
      { id: 't2', type: 'task', status: 'done', createdAt: '2026-06-01', updatedAt: '2026-06-23' },
    ])
    const result = checkStatusFlow(doc)
    expect(result.complianceRate).toBe(50)
  })

  it('violation has nodeId and details', () => {
    const ts = '2026-06-01T00:00:00Z'
    const doc = makeDoc([{ id: 't1', type: 'task', status: 'done', createdAt: ts, updatedAt: ts }])
    const violation = checkStatusFlow(doc).violations[0]
    expect(typeof violation.nodeId).toBe('string')
    expect(typeof violation.details).toBe('string')
  })
})
