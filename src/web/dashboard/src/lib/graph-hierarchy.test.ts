/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import {
  buildChildrenMap,
  getRootNodes,
  getVisibleNodes,
  buildHierarchyTree,
  hasExpandableChildren,
  getChildCount,
} from './graph-hierarchy'
import type { GraphNode, GraphEdge } from './types'

function node(id: string, parentId?: string | null): GraphNode {
  return {
    id,
    type: 'task',
    title: id,
    status: 'backlog',
    priority: 3,
    parentId,
  } as GraphNode
}

function edge(from: string, to: string, relationType: GraphEdge['relationType']): GraphEdge {
  return { id: `${from}-${to}`, from, to, relationType, createdAt: '' } as GraphEdge
}

describe('buildChildrenMap', () => {
  it('builds children from the parentId field', () => {
    const nodes = [node('root'), node('child', 'root')]
    const map = buildChildrenMap(nodes, [])
    expect(map.get('root')).toEqual(['child'])
  })

  it('builds children from parent_of edges', () => {
    const nodes = [node('a'), node('b')]
    const edges = [edge('a', 'b', 'parent_of')]
    const map = buildChildrenMap(nodes, edges)
    expect(map.get('a')).toEqual(['b'])
  })

  it('builds children from child_of edges (reversed)', () => {
    const nodes = [node('a'), node('b')]
    const edges = [edge('b', 'a', 'child_of')]
    const map = buildChildrenMap(nodes, edges)
    expect(map.get('a')).toEqual(['b'])
  })

  it('deduplicates children found via both parentId and edges', () => {
    const nodes = [node('a'), node('b', 'a')]
    const edges = [edge('a', 'b', 'parent_of')]
    const map = buildChildrenMap(nodes, edges)
    expect(map.get('a')).toEqual(['b'])
  })
})

describe('getRootNodes', () => {
  it('returns only nodes without a parentId', () => {
    const nodes = [node('root'), node('child', 'root')]
    expect(getRootNodes(nodes).map((n) => n.id)).toEqual(['root'])
  })
})

describe('getVisibleNodes', () => {
  it('shows only root nodes when nothing is expanded', () => {
    const nodes = [node('root'), node('child', 'root')]
    const map = buildChildrenMap(nodes, [])
    const visible = getVisibleNodes(nodes, new Set(), map)
    expect(visible.map((n) => n.id)).toEqual(['root'])
  })

  it('shows children of an expanded node', () => {
    const nodes = [node('root'), node('child', 'root')]
    const map = buildChildrenMap(nodes, [])
    const visible = getVisibleNodes(nodes, new Set(['root']), map)
    expect(visible.map((n) => n.id)).toEqual(['root', 'child'])
  })

  it('treats a node whose parentId points nowhere as a root (orphan)', () => {
    const nodes = [node('orphan', 'ghost-parent')]
    const map = buildChildrenMap(nodes, [])
    const visible = getVisibleNodes(nodes, new Set(), map)
    expect(visible.map((n) => n.id)).toEqual(['orphan'])
  })

  it('does not infinite-loop on a cycle', () => {
    const nodes = [node('a', 'b'), node('b', 'a')]
    const map = buildChildrenMap(nodes, [])
    expect(() => getVisibleNodes(nodes, new Set(['a', 'b']), map)).not.toThrow()
  })
})

describe('buildHierarchyTree', () => {
  it('returns an empty array for no nodes', () => {
    expect(buildHierarchyTree([], new Map())).toEqual([])
  })

  it('nests children under their parent', () => {
    const nodes = [node('root'), node('child', 'root')]
    const map = buildChildrenMap(nodes, [])
    const tree = buildHierarchyTree(nodes, map)
    expect(tree).toHaveLength(1)
    expect(tree[0].node.id).toBe('root')
    expect(tree[0].children[0].node.id).toBe('child')
  })

  it('does not infinite-loop on a cycle', () => {
    const nodes = [node('a', 'b'), node('b', 'a')]
    const map = buildChildrenMap(nodes, [])
    expect(() => buildHierarchyTree(nodes, map)).not.toThrow()
  })
})

describe('hasExpandableChildren / getChildCount', () => {
  it('reports no expandable children for a leaf node', () => {
    const map = new Map<string, string[]>()
    expect(hasExpandableChildren('leaf', map)).toBe(false)
    expect(getChildCount('leaf', map)).toBe(0)
  })

  it('reports expandable children and the correct count for a parent', () => {
    const map = new Map([['parent', ['a', 'b']]])
    expect(hasExpandableChildren('parent', map)).toBe(true)
    expect(getChildCount('parent', map)).toBe(2)
  })
})
