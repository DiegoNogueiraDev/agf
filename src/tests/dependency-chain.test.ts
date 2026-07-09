import { describe, it, expect } from 'vitest'
import { findTransitiveBlockers, detectCycles } from '../core/planner/dependency-chain.js'
import type { GraphDocument, GraphNode, GraphEdge } from '../core/graph/graph-types.js'

function makeDoc(nodes: Partial<GraphNode>[], edges: Partial<GraphEdge>[]): GraphDocument {
  const fullNodes = nodes.map((n, i) => ({
    id: `n-${i}`,
    title: `Node ${i}`,
    type: 'task' as const,
    status: 'pending' as const,
    priority: 2,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...n,
  }))
  const fullEdges = edges.map((e, i) => ({
    id: `e-${i}`,
    from: '',
    to: '',
    relationType: 'depends_on' as const,
    ...e,
  }))
  return { nodes: fullNodes, edges: fullEdges } as unknown as GraphDocument
}

describe('findTransitiveBlockers', () => {
  it('returns empty array when no edges exist', () => {
    const doc = makeDoc([{ id: 'n-a' }, { id: 'n-b' }], [])
    expect(findTransitiveBlockers(doc, 'n-a')).toHaveLength(0)
  })

  it('finds direct blocker via depends_on edge', () => {
    const doc = makeDoc([{ id: 'n-a' }, { id: 'n-b' }], [{ from: 'n-a', to: 'n-b', relationType: 'depends_on' }])
    const blockers = findTransitiveBlockers(doc, 'n-a')
    expect(blockers.some((n) => n.id === 'n-b')).toBe(true)
  })

  it('finds direct blocker via blocks edge', () => {
    const doc = makeDoc([{ id: 'n-a' }, { id: 'n-b' }], [{ from: 'n-b', to: 'n-a', relationType: 'blocks' }])
    const blockers = findTransitiveBlockers(doc, 'n-a')
    expect(blockers.some((n) => n.id === 'n-b')).toBe(true)
  })

  it('finds transitive blockers (A depends on B, B depends on C)', () => {
    const doc = makeDoc(
      [{ id: 'n-a' }, { id: 'n-b' }, { id: 'n-c' }],
      [
        { from: 'n-a', to: 'n-b', relationType: 'depends_on' },
        { from: 'n-b', to: 'n-c', relationType: 'depends_on' },
      ],
    )
    const blockers = findTransitiveBlockers(doc, 'n-a')
    expect(blockers.map((n) => n.id)).toContain('n-b')
    expect(blockers.map((n) => n.id)).toContain('n-c')
  })

  it('returns empty when node does not exist', () => {
    const doc = makeDoc([], [])
    expect(findTransitiveBlockers(doc, 'ghost')).toHaveLength(0)
  })
})

describe('detectCycles', () => {
  it('returns empty array when no cycles exist', () => {
    const doc = makeDoc([{ id: 'n-a' }, { id: 'n-b' }], [{ from: 'n-a', to: 'n-b', relationType: 'depends_on' }])
    expect(detectCycles(doc)).toHaveLength(0)
  })

  it('detects a 2-node cycle (A depends on B, B depends on A)', () => {
    const doc = makeDoc(
      [{ id: 'n-a' }, { id: 'n-b' }],
      [
        { from: 'n-a', to: 'n-b', relationType: 'depends_on' },
        { from: 'n-b', to: 'n-a', relationType: 'depends_on' },
      ],
    )
    const cycles = detectCycles(doc)
    expect(cycles.length).toBeGreaterThan(0)
  })
})
