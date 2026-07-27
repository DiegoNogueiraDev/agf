import { describe, it, expect } from 'vitest'
import { acHasEdgeCase, tasksMissingEdgeCases, isHighStakes } from '../core/analyzer/edge-case-detector.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

function makeDoc(nodes: Partial<GraphNode>[], acMap: Record<string, string[]> = {}): GraphDocument {
  return {
    nodes: nodes.map((n, i) => ({
      id: `n-${i}`,
      title: 'Task',
      type: 'task',
      status: 'pending',
      priority: 2,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      acceptanceCriteria: acMap[n.id ?? `n-${i}`] ?? [],
      ...n,
    })),
    edges: [],
  } as unknown as GraphDocument
}

describe('acHasEdgeCase', () => {
  it('returns true for AC mentioning error case', () => {
    expect(acHasEdgeCase('when an error occurs, show fallback')).toBe(true)
  })

  it('returns true for AC mentioning empty input', () => {
    expect(acHasEdgeCase('when the list is empty, display placeholder')).toBe(true)
  })

  it('returns true for AC mentioning boundary (limite)', () => {
    expect(acHasEdgeCase('at the limit of 100 items, truncate gracefully')).toBe(true)
  })

  it('returns false for normal happy-path AC', () => {
    expect(acHasEdgeCase('user can submit the form successfully')).toBe(false)
  })
})

describe('tasksMissingEdgeCases', () => {
  it('returns empty when task has no ACs at all', () => {
    const doc = makeDoc([{ id: 'n-0' }])
    expect(tasksMissingEdgeCases(doc)).toHaveLength(0)
  })

  it('returns task id when all ACs are happy-path only', () => {
    const doc = makeDoc([{ id: 'n-0', acceptanceCriteria: ['user can login successfully'] }])
    const missing = tasksMissingEdgeCases(doc)
    expect(missing).toContain('n-0')
  })

  it('does not flag task that has an edge-case AC', () => {
    const doc = makeDoc([{ id: 'n-0', acceptanceCriteria: ['on error, show retry button'] }])
    expect(tasksMissingEdgeCases(doc)).not.toContain('n-0')
  })
})

describe('isHighStakes', () => {
  it('returns true for security-tagged node', () => {
    const node = { tags: ['security'], title: 'Some feature' } as unknown as GraphNode
    expect(isHighStakes(node)).toBe(true)
  })

  it('returns true for node with auth in title', () => {
    const node = { tags: [], title: 'Implement OAuth2 auth flow' } as unknown as GraphNode
    expect(isHighStakes(node)).toBe(true)
  })

  it('returns true for payment-related title', () => {
    const node = { tags: [], title: 'Process payment' } as unknown as GraphNode
    expect(isHighStakes(node)).toBe(true)
  })

  it('returns false for ordinary feature', () => {
    const node = { tags: [], title: 'Display user profile' } as unknown as GraphNode
    expect(isHighStakes(node)).toBe(false)
  })
})
