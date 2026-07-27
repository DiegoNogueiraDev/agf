import { describe, it, expect } from 'vitest'
import { buildTraceabilityMatrix } from '../core/designer/traceability-matrix.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: object[] = [], edges: object[] = []): GraphDocument {
  return {
    version: 1,
    project: 'test',
    nodes: nodes as GraphDocument['nodes'],
    edges: edges as GraphDocument['edges'],
    indexes: { byId: {}, byType: {}, byStatus: {} },
    meta: {},
  } as unknown as GraphDocument
}

describe('buildTraceabilityMatrix', () => {
  it('returns empty matrix for document with no requirements', () => {
    const report = buildTraceabilityMatrix(makeDoc())
    expect(report.matrix).toHaveLength(0)
    expect(report.coverageRate).toBe(0)
  })

  it('marks requirements with no links as uncovered', () => {
    const doc = makeDoc([{ id: 'req1', type: 'requirement', title: 'R1', status: 'ready' }])
    const report = buildTraceabilityMatrix(doc)
    expect(report.matrix[0].coverage).toBe('none')
    expect(report.uncoveredRequirements ?? report.untracedRequirements).toContain('req1')
  })

  it('marks requirement as partial when linked to decision but not constraint', () => {
    const doc = makeDoc(
      [
        { id: 'req1', type: 'requirement', title: 'R1', status: 'ready' },
        { id: 'dec1', type: 'decision', title: 'D1', status: 'ready' },
      ],
      [{ id: 'e1', from: 'req1', to: 'dec1', relationType: 'implements' }],
    )
    const report = buildTraceabilityMatrix(doc)
    expect(report.matrix[0].coverage).toBe('partial')
  })

  it('marks requirement as full when linked to both decision and constraint', () => {
    const doc = makeDoc(
      [
        { id: 'req1', type: 'requirement', title: 'R1', status: 'ready' },
        { id: 'dec1', type: 'decision', title: 'D1', status: 'ready' },
        { id: 'con1', type: 'constraint', title: 'C1', status: 'ready' },
      ],
      [
        { id: 'e1', from: 'req1', to: 'dec1', relationType: 'implements' },
        { id: 'e2', from: 'req1', to: 'con1', relationType: 'implements' },
      ],
    )
    const report = buildTraceabilityMatrix(doc)
    expect(report.matrix[0].coverage).toBe('full')
  })

  it('computes a non-zero coverageRate when requirements are covered', () => {
    const doc = makeDoc(
      [
        { id: 'req1', type: 'requirement', title: 'R1', status: 'ready' },
        { id: 'dec1', type: 'decision', title: 'D1', status: 'ready' },
      ],
      [{ id: 'e1', from: 'req1', to: 'dec1', relationType: 'implements' }],
    )
    const report = buildTraceabilityMatrix(doc)
    expect(report.coverageRate).toBeGreaterThan(0)
  })
})
