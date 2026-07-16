import { describe, it, expect } from 'vitest'
import { graphToCsv } from '../core/graph/csv-export.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

function makeDoc(nodes: Partial<GraphNode>[]): GraphDocument {
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
    edges: [],
  } as unknown as GraphDocument
}

describe('graphToCsv', () => {
  it('returns a CSV string with header row', () => {
    const doc = makeDoc([{ id: 'n-0', title: 'My Task', type: 'task', status: 'done' }])
    const csv = graphToCsv(doc)
    expect(typeof csv).toBe('string')
    const lines = csv.split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(2)
    expect(lines[0]).toContain('id')
  })

  it('includes all nodes by default', () => {
    const doc = makeDoc([
      { id: 'n-0', status: 'done' },
      { id: 'n-1', status: 'pending' },
    ])
    const csv = graphToCsv(doc)
    expect(csv).toContain('n-0')
    expect(csv).toContain('n-1')
  })

  it('filters by status when filterStatus is provided', () => {
    const doc = makeDoc([
      { id: 'n-0', status: 'done' },
      { id: 'n-1', status: 'pending' },
    ])
    const csv = graphToCsv(doc, { filterStatus: ['done'] })
    expect(csv).toContain('n-0')
    expect(csv).not.toContain('n-1')
  })

  it('filters by type when filterType is provided', () => {
    const doc = makeDoc([
      { id: 'n-0', type: 'task' },
      { id: 'n-1', type: 'epic' },
    ])
    const csv = graphToCsv(doc, { filterType: ['task'] })
    expect(csv).toContain('n-0')
    expect(csv).not.toContain('n-1')
  })

  it('escapes commas in title', () => {
    const doc = makeDoc([{ id: 'n-0', title: 'Task, with comma' }])
    const csv = graphToCsv(doc)
    expect(csv).toContain('"Task, with comma"')
  })

  it('returns just the header for empty graph', () => {
    const doc = makeDoc([])
    const csv = graphToCsv(doc)
    const lines = csv.split('\n').filter(Boolean)
    expect(lines).toHaveLength(1)
  })
})
