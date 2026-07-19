import { describe, it, expect } from 'vitest'
import { findStructuralCandidates } from '../core/planner/reclassify-structural.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(
  nodes: Array<{ id: string; title: string; type: string; metadata?: Record<string, unknown> }>,
): GraphDocument {
  return {
    nodes: nodes.map((n) => ({
      ...n,
      status: 'pending',
      priority: 2,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })),
    edges: [],
  } as unknown as GraphDocument
}

describe('findStructuralCandidates', () => {
  it('returns empty array when no nodes match structural patterns', () => {
    const doc = makeDoc([{ id: 'n1', title: 'Implement login endpoint', type: 'task' }])
    expect(findStructuralCandidates(doc)).toHaveLength(0)
  })

  it('flags TIER A — ... heading pattern', () => {
    const doc = makeDoc([{ id: 'n1', title: 'TIER A — Core Features', type: 'task' }])
    const result = findStructuralCandidates(doc)
    expect(result).toHaveLength(1)
    expect(result[0]?.nodeId).toBe('n1')
  })

  it('flags Sequenciamento heading', () => {
    const doc = makeDoc([{ id: 'n2', title: 'Sequenciamento das tarefas do sprint', type: 'epic' }])
    const result = findStructuralCandidates(doc)
    expect(result).toHaveLength(1)
  })

  it('flags Roadmap heading', () => {
    const doc = makeDoc([{ id: 'n3', title: 'Roadmap para Q3 2026', type: 'task' }])
    const result = findStructuralCandidates(doc)
    expect(result).toHaveLength(1)
  })

  it('does not flag non-structural task types (risk, milestone)', () => {
    const doc = makeDoc([{ id: 'n4', title: 'TIER A — should be ignored', type: 'risk' }])
    expect(findStructuralCandidates(doc)).toHaveLength(0)
  })

  it('flags alreadyMarked=true when implementable=false in metadata', () => {
    const doc = makeDoc([
      { id: 'n5', title: 'TIER B — Advanced Features', type: 'task', metadata: { implementable: false } },
    ])
    const result = findStructuralCandidates(doc)
    expect(result[0]?.alreadyMarked).toBe(true)
  })
})
