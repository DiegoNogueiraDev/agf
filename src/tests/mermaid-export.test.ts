import { describe, it, expect } from 'vitest'
import { filterNodes, graphToMermaid } from '../core/graph/mermaid-export.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'n1',
    title: 'Test Node',
    type: 'task',
    status: 'backlog',
    priority: 2,
    description: null,
    parentId: null,
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as unknown as GraphNode
}

function makeEdge(from: string, to: string, relationType = 'depends_on'): GraphEdge {
  return { id: `e-${from}-${to}`, from, to, relationType } as unknown as GraphEdge
}

describe('filterNodes', () => {
  it('returns all nodes when no options provided', () => {
    const nodes = [makeNode({ id: 'a' }), makeNode({ id: 'b', status: 'done' })]
    expect(filterNodes(nodes)).toHaveLength(2)
  })

  it('filters by status', () => {
    const nodes = [makeNode({ status: 'done' }), makeNode({ status: 'backlog' }), makeNode({ status: 'in_progress' })]
    const result = filterNodes(nodes, { filterStatus: ['done'] })
    expect(result).toHaveLength(1)
    expect(result[0]!.status).toBe('done')
  })

  it('filters by type', () => {
    const nodes = [makeNode({ type: 'task' }), makeNode({ type: 'epic' }), makeNode({ type: 'risk' })]
    const result = filterNodes(nodes, { filterType: ['task'] })
    expect(result).toHaveLength(1)
    expect(result[0]!.type).toBe('task')
  })

  it('filters by both status and type', () => {
    const nodes = [
      makeNode({ id: 'a', type: 'task', status: 'done' }),
      makeNode({ id: 'b', type: 'epic', status: 'done' }),
      makeNode({ id: 'c', type: 'task', status: 'backlog' }),
    ]
    const result = filterNodes(nodes, { filterStatus: ['done'], filterType: ['task'] })
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('a')
  })

  it('returns empty array when nothing matches', () => {
    const nodes = [makeNode({ status: 'backlog' })]
    const result = filterNodes(nodes, { filterStatus: ['done'] })
    expect(result).toHaveLength(0)
  })
})

describe('graphToMermaid', () => {
  it('returns a string for empty nodes', () => {
    const result = graphToMermaid([], [])
    expect(typeof result).toBe('string')
  })

  it('includes node titles in flowchart output', () => {
    const nodes = [makeNode({ id: 'n1', title: 'My Task' })]
    const result = graphToMermaid(nodes, [], { format: 'flowchart' })
    expect(result).toContain('My Task')
  })

  it('flowchart format contains graph directive', () => {
    const result = graphToMermaid([], [], { format: 'flowchart' })
    expect(result.toLowerCase()).toMatch(/flowchart|graph/)
  })

  it('includes edge connections in flowchart', () => {
    const nodes = [makeNode({ id: 'a', title: 'A' }), makeNode({ id: 'b', title: 'B' })]
    const edges = [makeEdge('a', 'b')]
    const result = graphToMermaid(nodes, edges, { format: 'flowchart' })
    expect(result).toContain('a')
    expect(result).toContain('b')
  })

  it('supports LR direction', () => {
    const result = graphToMermaid([], [], { format: 'flowchart', direction: 'LR' })
    expect(result).toContain('LR')
  })

  it('includes relation-type edge labels by default', () => {
    const nodes = [makeNode({ id: 'a', title: 'A' }), makeNode({ id: 'b', title: 'B' })]
    const edges = [makeEdge('a', 'b', 'blocks')]
    const result = graphToMermaid(nodes, edges, { format: 'flowchart' })
    expect(result).toContain('|blocks|')
  })

  it('omits edge labels when includeEdgeLabels is false', () => {
    const nodes = [makeNode({ id: 'a', title: 'A' }), makeNode({ id: 'b', title: 'B' })]
    const edges = [makeEdge('a', 'b', 'implements')]
    const result = graphToMermaid(nodes, edges, { format: 'flowchart', includeEdgeLabels: false })
    expect(result).not.toContain('|implements|')
    expect(result).toContain('a --> b')
  })
})
