/*!
 * Task node_9b413ac5ddf4 — graph-layout computeLayout (pure).
 *
 * AC3: computeLayout(nodes,edges) → numeric {x,y} positions without NaN,
 *      deterministic (2 calls produce identical results),
 *      nodes in same level have distinct x values;
 *      banner 'mostrando N de M' when truncated.
 */

import { describe, it, expect } from 'vitest'
import { computeLayout, type LayoutNode } from '../core/web/views/graph-layout.js'
import type { GraphSnapshotNode, GraphSnapshotEdge } from '../core/web/graph-snapshot.js'

function node(id: string, parentId: string | null = null): GraphSnapshotNode {
  return { id, type: 'task', title: `Task ${id}`, status: 'backlog', parentId, priority: 1 }
}

describe('computeLayout', () => {
  it('returns numeric x/y for all nodes, no NaN', () => {
    const nodes = [node('a'), node('b', 'a'), node('c', 'a')]
    const edges: GraphSnapshotEdge[] = [
      { from: 'a', to: 'b', relationType: 'depends_on' },
      { from: 'a', to: 'c', relationType: 'depends_on' },
    ]
    const result: LayoutNode[] = computeLayout(nodes, edges)
    expect(result).toHaveLength(3)
    for (const n of result) {
      expect(Number.isFinite(n.x)).toBe(true)
      expect(Number.isFinite(n.y)).toBe(true)
    }
  })

  it('is deterministic — two calls with same input produce identical results', () => {
    const nodes = [node('x'), node('y', 'x'), node('z')]
    const edges: GraphSnapshotEdge[] = []
    const r1 = computeLayout(nodes, edges)
    const r2 = computeLayout(nodes, edges)
    for (let i = 0; i < r1.length; i++) {
      expect(r1[i].x).toBe(r2[i].x)
      expect(r1[i].y).toBe(r2[i].y)
    }
  })

  it('nodes at same depth level have distinct x values', () => {
    const nodes = [node('root'), node('childA', 'root'), node('childB', 'root')]
    const edges: GraphSnapshotEdge[] = []
    const result = computeLayout(nodes, edges)
    const children = result.filter((n) => n.id === 'childA' || n.id === 'childB')
    expect(children[0].x).not.toBe(children[1].x)
  })

  it('handles empty graph without crash', () => {
    expect(computeLayout([], [])).toEqual([])
  })
})
