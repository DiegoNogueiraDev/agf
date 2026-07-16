import { describe, it, expect } from 'vitest'
import { checkDocCompleteness } from '../core/handoff/doc-completeness.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: Partial<{ id: string; title: string; description?: string }>[] = []): GraphDocument {
  const fullNodes = nodes.map((n, i) => ({
    id: n.id ?? `node-${i}`,
    type: 'task' as const,
    title: n.title ?? `Task ${i}`,
    status: 'backlog' as const,
    priority: 3,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    description: n.description,
    acceptanceCriteria: [],
    metadata: {},
  }))
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes: fullNodes,
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  } as unknown as GraphDocument
}

describe('checkDocCompleteness', () => {
  it('returns 100% coverage for empty doc', () => {
    const result = checkDocCompleteness(makeDoc([]))
    expect(result.coverageRate).toBe(100)
    expect(result.totalNodes).toBe(0)
  })

  it('returns 100% when all nodes have descriptions', () => {
    const result = checkDocCompleteness(makeDoc([{ description: 'First task' }, { description: 'Second task' }]))
    expect(result.coverageRate).toBe(100)
    expect(result.nodesWithoutDescription).toHaveLength(0)
  })

  it('returns 0% when no nodes have descriptions', () => {
    const result = checkDocCompleteness(makeDoc([{}, {}]))
    expect(result.coverageRate).toBe(0)
    expect(result.nodesWithoutDescription).toHaveLength(2)
  })

  it('returns 50% when half have descriptions', () => {
    const result = checkDocCompleteness(makeDoc([{ description: 'has one' }, {}]))
    expect(result.coverageRate).toBe(50)
    expect(result.descriptionsPresent).toBe(1)
    expect(result.totalNodes).toBe(2)
  })

  it('nodesWithoutDescription contains node titles', () => {
    const result = checkDocCompleteness(makeDoc([{ title: 'Missing desc', id: 'n1' }]))
    expect(result.nodesWithoutDescription[0].nodeId).toBe('n1')
    expect(result.nodesWithoutDescription[0].title).toBe('Missing desc')
  })
})
