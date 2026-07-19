import { describe, it, expect } from 'vitest'
import { buildIndexes } from '../core/graph/graph-indexes.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

function makeNode(id: string, parentId?: string): GraphNode {
  return {
    id,
    type: 'task',
    title: `Node ${id}`,
    status: 'ready',
    parentId,
  } as unknown as GraphNode
}

function makeEdge(from: string, to: string): GraphEdge {
  return { id: `${from}->${to}`, from, to, type: 'depends_on' } as unknown as GraphEdge
}

describe('buildIndexes', () => {
  it('builds empty indexes for no nodes', () => {
    const idx = buildIndexes([], [])
    expect(idx.byId).toEqual({})
    expect(idx.childrenByParent).toEqual({})
  })

  it('maps node id to array index in byId', () => {
    const nodes = [makeNode('a'), makeNode('b')]
    const idx = buildIndexes(nodes, [])
    expect(idx.byId['a']).toBe(0)
    expect(idx.byId['b']).toBe(1)
  })

  it('groups children by parentId in childrenByParent', () => {
    const parent = makeNode('parent')
    const child1 = makeNode('child1', 'parent')
    const child2 = makeNode('child2', 'parent')
    const idx = buildIndexes([parent, child1, child2], [])
    expect(idx.childrenByParent['parent']).toContain('child1')
    expect(idx.childrenByParent['parent']).toContain('child2')
  })

  it('builds incomingByNode from edges (stores edge IDs)', () => {
    const nodes = [makeNode('a'), makeNode('b')]
    const edge = makeEdge('a', 'b')
    const idx = buildIndexes(nodes, [edge])
    expect(idx.incomingByNode['b']).toContain(edge.id)
  })

  it('builds outgoingByNode from edges (stores edge IDs)', () => {
    const nodes = [makeNode('a'), makeNode('b')]
    const edge = makeEdge('a', 'b')
    const idx = buildIndexes(nodes, [edge])
    expect(idx.outgoingByNode['a']).toContain(edge.id)
  })

  it('handles multiple edges to same node', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')]
    const e1 = makeEdge('a', 'c')
    const e2 = makeEdge('b', 'c')
    const idx = buildIndexes(nodes, [e1, e2])
    expect(idx.incomingByNode['c'].length).toBe(2)
  })

  it('root nodes have no parent entry in childrenByParent', () => {
    const nodes = [makeNode('a'), makeNode('b')]
    const idx = buildIndexes(nodes, [])
    expect(idx.childrenByParent['a']).toBeUndefined()
  })
})
