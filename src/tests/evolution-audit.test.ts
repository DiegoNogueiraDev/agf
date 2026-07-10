/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { analyzeEvolutionAudit } from '../core/analyzer/evolution-audit.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

function makeNode(overrides: Partial<GraphNode>): GraphNode {
  return {
    id: 'n1',
    type: 'task',
    title: 'Test',
    status: 'backlog',
    priority: 3,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeDoc(nodes: GraphNode[]): GraphDocument {
  return {
    version: '1',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes,
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

describe('analyzeEvolutionAudit', () => {
  it('returns zero regenerated when no nodes have evolutionReason', () => {
    const doc = makeDoc([makeNode({ id: 't1' })])
    const result = analyzeEvolutionAudit(doc)
    expect(result.totalRegenerated).toBe(0)
    expect(result.totalRegenerations).toBe(0)
    expect(result.top).toEqual([])
    expect(result.byReason).toEqual([])
    expect(result.summary).toBe('no nodes regenerated')
  })

  it('reports regenerated nodes', () => {
    const doc = makeDoc([
      makeNode({ id: 't1', title: 'Task A', evolutionCount: 3, evolutionReason: '§extracta — prompt refinement' }),
      makeNode({ id: 't2', title: 'Task B', evolutionCount: 1, evolutionReason: '§extracta — scope change' }),
    ])
    const result = analyzeEvolutionAudit(doc)
    expect(result.totalRegenerated).toBe(2)
    expect(result.totalRegenerations).toBe(4)
    expect(result.top.length).toBe(2)
    expect(result.top[0].evolutionCount).toBe(3)
    expect(result.top[0].evolutionReason).toContain('prompt refinement')
  })

  it('sorts by evolutionCount descending, then updatedAt', () => {
    const doc = makeDoc([
      makeNode({
        id: 't1',
        title: 'High',
        evolutionCount: 5,
        evolutionReason: 'reason A',
        updatedAt: '2025-06-01T00:00:00.000Z',
      }),
      makeNode({
        id: 't2',
        title: 'Low',
        evolutionCount: 2,
        evolutionReason: 'reason B',
        updatedAt: '2025-06-02T00:00:00.000Z',
      }),
    ])
    const result = analyzeEvolutionAudit(doc)
    expect(result.top[0].nodeId).toBe('t1')
    expect(result.top[0].evolutionCount).toBe(5)
  })

  it('groups by reasons', () => {
    const doc = makeDoc([
      makeNode({ id: 't1', title: 'A', evolutionCount: 1, evolutionReason: '§extracta — prompt refinement' }),
      makeNode({ id: 't2', title: 'B', evolutionCount: 1, evolutionReason: '§extracta — prompt refinement' }),
      makeNode({ id: 't3', title: 'C', evolutionCount: 1, evolutionReason: '§extracta — scope change' }),
    ])
    const result = analyzeEvolutionAudit(doc)
    const promptRef = result.byReason.find((r) => r.reason.includes('prompt refinement'))
    expect(promptRef).toBeDefined()
    expect(promptRef!.count).toBe(2)
  })

  it('respects topLimit option', () => {
    const doc = makeDoc([
      makeNode({ id: 't1', title: 'A', evolutionCount: 1, evolutionReason: 'r1' }),
      makeNode({ id: 't2', title: 'B', evolutionCount: 1, evolutionReason: 'r2' }),
      makeNode({ id: 't3', title: 'C', evolutionCount: 1, evolutionReason: 'r3' }),
    ])
    const result = analyzeEvolutionAudit(doc, { topLimit: 2 })
    expect(result.top.length).toBe(2)
  })

  it('ignores nodes with evolutionReason but zero count', () => {
    const doc = makeDoc([makeNode({ id: 't1', title: 'A', evolutionCount: 0, evolutionReason: 'should not appear' })])
    const result = analyzeEvolutionAudit(doc)
    expect(result.totalRegenerated).toBe(0)
  })
})
