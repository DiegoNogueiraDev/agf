/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_0d67eca280f6 — independentSet(doc, k): up to k unblocked tasks with no
 * mutual transitive depends_on, so N colony ants can pull them in parallel without
 * ordering conflicts. Pure, deterministic (~0 token); reuses findTransitiveBlockers.
 */

import { describe, it, expect } from 'vitest'
import { independentSet } from '../core/planner/independent-set.js'
import type { GraphDocument, GraphNode, GraphEdge } from '../core/graph/graph-types.js'

function node(over: Partial<GraphNode> & { id: string }): GraphNode {
  const now = new Date().toISOString()
  return {
    id: over.id,
    type: 'task',
    title: over.id,
    status: 'backlog',
    priority: 3,
    acceptanceCriteria: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...over,
  } as GraphNode
}

/** `from depends_on to` — `from` must come after `to`. */
function dependsOn(from: string, to: string): GraphEdge {
  return { id: `${from}-${to}`, from, to, relationType: 'depends_on', createdAt: new Date().toISOString() }
}

function doc(nodes: GraphNode[], edges: GraphEdge[] = []): GraphDocument {
  return { nodes, edges } as GraphDocument
}

describe('independentSet', () => {
  it('AC1: never returns two tasks on the same dependency path', () => {
    // a depends_on b — they are on one chain, so at most one may be returned
    const d = doc([node({ id: 'a' }), node({ id: 'b' })], [dependsOn('a', 'b')])
    const set = independentSet(d, 2)
    expect(set).toHaveLength(1)
  })

  it('collapses a transitive chain a→b→c to a single pick', () => {
    const d = doc([node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' })], [dependsOn('a', 'b'), dependsOn('b', 'c')])
    expect(independentSet(d, 3)).toHaveLength(1)
  })

  it('AC2: returns exactly k when k independent tasks exist', () => {
    const d = doc([node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' })])
    expect(independentSet(d, 2)).toHaveLength(2)
    expect(independentSet(d, 3)).toHaveLength(3)
  })

  it('picks one task from each independent chain', () => {
    // two disjoint chains: a→b and c→d
    const d = doc(
      [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' }), node({ id: 'd' })],
      [dependsOn('a', 'b'), dependsOn('c', 'd')],
    )
    const set = independentSet(d, 2)
    expect(set).toHaveLength(2)
    // the two picks must not be on the same chain
    const ids = set.map((n) => n.id).sort()
    expect(ids).not.toEqual(['a', 'b'])
    expect(ids).not.toEqual(['c', 'd'])
  })

  it('AC3: all tasks blocked → empty set, at most 1, no error (WIP=1 preserved)', () => {
    const d = doc([node({ id: 'a', status: 'blocked' }), node({ id: 'b', blocked: true })])
    const set = independentSet(d, 3)
    expect(set.length).toBeLessThanOrEqual(1)
    expect(set).toHaveLength(0)
  })

  it('returns [] for k <= 0', () => {
    const d = doc([node({ id: 'a' })])
    expect(independentSet(d, 0)).toHaveLength(0)
    expect(independentSet(d, -1)).toHaveLength(0)
  })

  it('is deterministic — same input yields the same picks in the same order', () => {
    const d = doc([node({ id: 'a', priority: 1 }), node({ id: 'b', priority: 5 }), node({ id: 'c', priority: 3 })])
    const first = independentSet(d, 2).map((n) => n.id)
    const second = independentSet(d, 2).map((n) => n.id)
    expect(first).toEqual(second)
    expect(first[0]).toBe('b') // highest priority first
  })

  it('ignores non-task nodes (epics, contracts) as candidates', () => {
    const d = doc([node({ id: 'e', type: 'epic' }), node({ id: 't', type: 'task' })])
    const set = independentSet(d, 5)
    expect(set.map((n) => n.id)).toEqual(['t'])
  })
})
