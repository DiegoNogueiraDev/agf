/*!
 * SPDX-License-Identifier: Apache-2.0
 * Tests for src/core/planner/decompose.ts
 */

import { describe, it, expect } from 'vitest'
import { detectLargeTasks, needsHtnDecomposeGuard } from '../core/planner/decompose.js'
import type { GraphDocument, GraphNode, GraphEdge } from '../core/graph/graph-types.js'

function makeDoc(nodes: Partial<GraphNode>[], edges: GraphEdge[] = []): GraphDocument {
  const now = new Date().toISOString()
  const fullNodes: GraphNode[] = nodes.map((n, i) => ({
    id: n.id ?? `node-${i}`,
    type: n.type ?? 'task',
    title: n.title ?? `Task ${i}`,
    status: n.status ?? 'backlog',
    priority: n.priority ?? 3,
    xpSize: n.xpSize,
    estimateMinutes: n.estimateMinutes,
    acceptanceCriteria: n.acceptanceCriteria,
    parentId: n.parentId ?? null,
    createdAt: now,
    updatedAt: now,
  }))
  return {
    version: '1',
    project: { id: 'p1', name: 'Test Project', createdAt: now, updatedAt: now },
    nodes: fullNodes,
    edges,
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

describe('detectLargeTasks', () => {
  it('returns empty array for empty document', () => {
    const doc = makeDoc([])
    expect(detectLargeTasks(doc)).toEqual([])
  })

  it('detects task with estimateMinutes > 120 as large', () => {
    const doc = makeDoc([{ id: 't1', type: 'task', estimateMinutes: 200 }])
    const results = detectLargeTasks(doc)
    expect(results).toHaveLength(1)
    expect(results[0]?.node.id).toBe('t1')
    expect(results[0]?.reasons.some((r) => r.includes('200min'))).toBe(true)
  })

  it('detects task with xpSize XL as large', () => {
    const doc = makeDoc([{ id: 't2', type: 'task', xpSize: 'XL' }])
    const results = detectLargeTasks(doc)
    expect(results).toHaveLength(1)
    expect(results[0]?.reasons.some((r) => r.includes('XL'))).toBe(true)
  })

  it('does not flag task with xpSize S (below threshold)', () => {
    const doc = makeDoc([{ id: 't3', type: 'task', xpSize: 'S', estimateMinutes: 30 }])
    expect(detectLargeTasks(doc)).toHaveLength(0)
  })

  it('detects task with more than 5 acceptance criteria', () => {
    const ac = ['AC1', 'AC2', 'AC3', 'AC4', 'AC5', 'AC6']
    const doc = makeDoc([{ id: 't4', type: 'task', acceptanceCriteria: ac }])
    const results = detectLargeTasks(doc)
    expect(results).toHaveLength(1)
    expect(results[0]?.reasons.some((r) => r.includes('6 acceptance criteria'))).toBe(true)
  })

  it('detects epic without children as needing decomposition', () => {
    const doc = makeDoc([{ id: 'e1', type: 'epic', title: 'Empty Epic' }])
    const results = detectLargeTasks(doc)
    expect(results).toHaveLength(1)
    expect(results[0]?.reasons.some((r) => r.includes('epic without children'))).toBe(true)
  })

  it('ignores done tasks', () => {
    const doc = makeDoc([{ id: 't5', type: 'task', status: 'done', estimateMinutes: 999 }])
    expect(detectLargeTasks(doc)).toHaveLength(0)
  })
})

describe('needsHtnDecomposeGuard', () => {
  it('fires for XS task with zero acceptance criteria', () => {
    expect(needsHtnDecomposeGuard('XS', 0)).toBe(true)
  })

  it('does not fire for XS task with at least one acceptance criterion', () => {
    expect(needsHtnDecomposeGuard('XS', 1)).toBe(false)
  })

  it('does not fire for non-XS sizes even with zero acceptance criteria', () => {
    expect(needsHtnDecomposeGuard('S', 0)).toBe(false)
    expect(needsHtnDecomposeGuard('M', 0)).toBe(false)
    expect(needsHtnDecomposeGuard(undefined, 0)).toBe(false)
  })
})
