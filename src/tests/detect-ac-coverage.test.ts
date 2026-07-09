import { describe, it, expect } from 'vitest'
import { detectAcCoverage } from '../core/gaps/detect-ac-coverage.js'
import type { GraphDocument, GraphNode, GraphEdge } from '../core/graph/graph-types.js'

function makeDoc(nodes: Partial<GraphNode>[], edges: Partial<GraphEdge>[] = []): GraphDocument {
  return {
    nodes: nodes.map((n, i) => ({
      id: `n-${i}`,
      title: 'Task',
      type: 'task',
      status: 'pending',
      priority: 2,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      ...n,
    })),
    edges: edges.map((e, i) => ({ id: `e-${i}`, relationType: 'depends_on', ...e })),
  } as unknown as GraphDocument
}

describe('detectAcCoverage', () => {
  it('returns empty array when no decomposed parents exist', () => {
    const doc = makeDoc([{ id: 'n-a', type: 'task', acceptanceCriteria: ['AC1'] }])
    expect(detectAcCoverage(doc)).toHaveLength(0)
  })

  it('returns empty array when graph has no nodes', () => {
    const doc = makeDoc([])
    expect(detectAcCoverage(doc)).toHaveLength(0)
  })

  it('returns no gaps when parent has no acceptanceCriteria', () => {
    const doc = makeDoc(
      [
        { id: 'n-parent', type: 'epic', acceptanceCriteria: [] },
        { id: 'n-child', type: 'task' },
      ],
      [{ from: 'n-parent', to: 'n-child', relationType: 'parent_of' }],
    )
    expect(detectAcCoverage(doc)).toHaveLength(0)
  })
})
