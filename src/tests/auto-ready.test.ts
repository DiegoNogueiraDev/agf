import { describe, it, expect } from 'vitest'
import { analyzeAutoReady } from '../core/planner/auto-ready.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

function makeDoc(
  nodes: Partial<GraphNode>[],
  edges: Array<{ from: string; to: string; relationType: string }> = [],
): GraphDocument {
  return {
    nodes: nodes.map((n) => ({
      id: 'n-default',
      title: 'Default',
      type: 'task',
      status: 'backlog',
      priority: 2,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      ...n,
    })),
    edges: edges.map((e, i) => ({ id: `e-${i}`, ...e })),
  } as unknown as GraphDocument
}

describe('analyzeAutoReady', () => {
  it('returns empty when no backlog tasks exist', () => {
    const doc = makeDoc([{ id: 'n1', status: 'done' }])
    const report = analyzeAutoReady(doc)
    expect(report.candidates).toHaveLength(0)
    expect(report.totalCandidates).toBe(0)
  })

  it('promotes task with sprint + AC + all deps done', () => {
    const doc = makeDoc(
      [
        { id: 'n1', status: 'backlog', sprint: 'S1', acceptanceCriteria: ['AC1'] },
        { id: 'n2', status: 'done' },
      ],
      [{ from: 'n1', to: 'n2', relationType: 'depends_on' }],
    )
    const report = analyzeAutoReady(doc)
    expect(report.candidates.some((c) => c.nodeId === 'n1')).toBe(true)
  })

  it('does not promote task missing a sprint', () => {
    const doc = makeDoc([{ id: 'n1', status: 'backlog', acceptanceCriteria: ['AC1'] }])
    expect(analyzeAutoReady(doc).candidates).toHaveLength(0)
  })

  it('does not promote task missing AC', () => {
    const doc = makeDoc([{ id: 'n1', status: 'backlog', sprint: 'S1', acceptanceCriteria: [] }])
    expect(analyzeAutoReady(doc).candidates).toHaveLength(0)
  })

  it('does not promote task that is blocked', () => {
    const doc = makeDoc([{ id: 'n1', status: 'backlog', sprint: 'S1', acceptanceCriteria: ['AC1'], blocked: true }])
    expect(analyzeAutoReady(doc).candidates).toHaveLength(0)
  })

  it('does not promote task with unresolved dependency', () => {
    const doc = makeDoc(
      [
        { id: 'n1', status: 'backlog', sprint: 'S1', acceptanceCriteria: ['AC1'] },
        { id: 'n2', status: 'in_progress' },
      ],
      [{ from: 'n1', to: 'n2', relationType: 'depends_on' }],
    )
    expect(analyzeAutoReady(doc).candidates).toHaveLength(0)
  })

  it('excludes scaffolding nodes (implementable=false)', () => {
    const doc = makeDoc([
      { id: 'n1', status: 'backlog', sprint: 'S1', acceptanceCriteria: ['AC1'], metadata: { implementable: false } },
    ])
    expect(analyzeAutoReady(doc).candidates).toHaveLength(0)
  })
})
