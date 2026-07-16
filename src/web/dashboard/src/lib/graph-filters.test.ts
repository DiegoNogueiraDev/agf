/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_f05acd509b3d
 *
 * AC1: GIVEN showFullGraph=true WHEN filterTopLevelNodes runs THEN returns all nodes unchanged
 * AC2: GIVEN showFullGraph=false WHEN filterTopLevelNodes runs THEN keeps only TOP_LEVEL_TYPES or parentless nodes
 * AC3: GIVEN a nodeId WHEN getNodeEdgeSummary runs THEN splits edges into outgoing (from===nodeId) and incoming (to===nodeId)
 * AC4: GIVEN no matching edges WHEN getNodeEdgeSummary runs THEN returns empty outgoing/incoming arrays
 */

import { describe, it, expect } from 'vitest'
import { filterTopLevelNodes, getNodeEdgeSummary, TOP_LEVEL_TYPES } from './graph-filters'

interface TestNode {
  type: string
  parentId?: string | null
}

interface TestEdge {
  from: string
  to: string
}

function node(type: string, parentId?: string | null): TestNode {
  return { type, parentId }
}

describe('TOP_LEVEL_TYPES', () => {
  it('contains epic, milestone, requirement, constraint', () => {
    expect([...TOP_LEVEL_TYPES].sort()).toEqual(['constraint', 'epic', 'milestone', 'requirement'])
  })
})

describe('filterTopLevelNodes', () => {
  it('returns all nodes unchanged when showFullGraph is true', () => {
    const nodes = [node('task', 'p1'), node('epic'), node('bug', 'p1')]
    expect(filterTopLevelNodes(nodes, true)).toEqual(nodes)
  })

  it('keeps nodes whose type is in TOP_LEVEL_TYPES when showFullGraph is false', () => {
    const epic = node('epic', 'p1')
    const task = node('task', 'p1')
    expect(filterTopLevelNodes([epic, task], false)).toEqual([epic])
  })

  it('keeps nodes without a parentId even if their type is not top-level', () => {
    const orphanTask = node('task', undefined)
    const childTask = node('task', 'p1')
    expect(filterTopLevelNodes([orphanTask, childTask], false)).toEqual([orphanTask])
  })

  it('drops non-top-level nodes that have a parentId', () => {
    const childTask = node('task', 'p1')
    expect(filterTopLevelNodes([childTask], false)).toEqual([])
  })
})

describe('getNodeEdgeSummary', () => {
  it('splits edges into outgoing and incoming relative to nodeId', () => {
    const edges: TestEdge[] = [
      { from: 'n1', to: 'n2' },
      { from: 'n3', to: 'n1' },
      { from: 'n4', to: 'n5' },
    ]
    const result = getNodeEdgeSummary('n1', edges)
    expect(result.outgoing).toEqual([{ from: 'n1', to: 'n2' }])
    expect(result.incoming).toEqual([{ from: 'n3', to: 'n1' }])
  })

  it('returns empty arrays when no edges reference nodeId', () => {
    const edges: TestEdge[] = [{ from: 'n2', to: 'n3' }]
    expect(getNodeEdgeSummary('n1', edges)).toEqual({ outgoing: [], incoming: [] })
  })

  it('places a self-loop edge in both outgoing and incoming', () => {
    const edges: TestEdge[] = [{ from: 'n1', to: 'n1' }]
    const result = getNodeEdgeSummary('n1', edges)
    expect(result.outgoing).toEqual([{ from: 'n1', to: 'n1' }])
    expect(result.incoming).toEqual([{ from: 'n1', to: 'n1' }])
  })
})
