import { describe, it, expect } from 'vitest'
import { analyzeCoupling } from '../core/designer/coupling-analyzer.js'

type GraphDocument = Parameters<typeof analyzeCoupling>[0]

const emptyDoc: GraphDocument = { nodes: [], edges: [] }

function makeDoc(): GraphDocument {
  return {
    nodes: [
      { id: 'a', title: 'A', type: 'task' },
      { id: 'b', title: 'B', type: 'task' },
      { id: 'c', title: 'C', type: 'task' },
    ] as any[],
    edges: [
      { id: 'e1', from: 'a', to: 'b', relationType: 'depends_on' },
      { id: 'e2', from: 'b', to: 'c', relationType: 'depends_on' },
    ] as any[],
  }
}

describe('analyzeCoupling', () => {
  it('returns empty report for empty doc', () => {
    const report = analyzeCoupling(emptyDoc)
    expect(report.nodes).toHaveLength(0)
    expect(report.highCouplingNodes).toHaveLength(0)
    expect(report.isolatedNodes).toHaveLength(0)
    expect(report.avgFanIn).toBe(0)
    expect(report.avgFanOut).toBe(0)
  })

  it('returns report with required fields', () => {
    const report = analyzeCoupling(makeDoc())
    expect(Array.isArray(report.nodes)).toBe(true)
    expect(Array.isArray(report.highCouplingNodes)).toBe(true)
    expect(Array.isArray(report.isolatedNodes)).toBe(true)
    expect(typeof report.avgFanIn).toBe('number')
    expect(typeof report.avgFanOut).toBe('number')
    expect(typeof report.avgInstability).toBe('number')
  })

  it('identifies isolated nodes (no edges but has parentId)', () => {
    const doc: GraphDocument = {
      nodes: [
        { id: 'parent', title: 'Parent', type: 'epic', parentId: null },
        { id: 'child', title: 'Child', type: 'task', parentId: 'parent' },
      ] as any[],
      edges: [],
    }
    const report = analyzeCoupling(doc)
    expect(report.isolatedNodes).toContain('child')
  })

  it('avgFanIn and avgFanOut are non-negative', () => {
    const report = analyzeCoupling(makeDoc())
    expect(report.avgFanIn).toBeGreaterThanOrEqual(0)
    expect(report.avgFanOut).toBeGreaterThanOrEqual(0)
  })
})
