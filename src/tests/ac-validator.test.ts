/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { validateAcQuality } from '../core/analyzer/ac-validator.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

function makeNode(overrides: Partial<GraphNode>): GraphNode {
  return {
    id: 'n1',
    type: 'task',
    title: 'Test task',
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

describe('validateAcQuality', () => {
  it('returns empty report when no nodes have AC', () => {
    const doc = makeDoc([makeNode({ type: 'epic', id: 'e1', title: 'Epic' })])
    const result = validateAcQuality(doc)
    expect(result.nodes).toEqual([])
    expect(result.overallScore).toBe(0)
    expect(typeof result.summary).toBe('string')
  })

  it('validates a single node by id', () => {
    const doc = makeDoc([makeNode({ id: 't1', title: 'Login', acceptanceCriteria: ['User must see a login form'] })])
    const result = validateAcQuality(doc, 't1')
    expect(result.nodes.length).toBe(1)
    expect(result.nodes[0].nodeId).toBe('t1')
    expect(typeof result.nodes[0].score).toBe('number')
    expect(result.nodes[0].investChecks.length).toBeGreaterThanOrEqual(6)
  })

  it('returns INVEST checks with correct criteria labels', () => {
    const doc = makeDoc([
      makeNode({
        id: 't1',
        title: 'Feature',
        acceptanceCriteria: ['Given user is logged in When they click save Then data is saved'],
      }),
    ])
    const result = validateAcQuality(doc, 't1')
    const criteriaLabels = result.nodes[0].investChecks.map((c) => c.criterion)
    expect(criteriaLabels).toContain('Independent')
    expect(criteriaLabels).toContain('Negotiable')
    expect(criteriaLabels).toContain('Valuable')
    expect(criteriaLabels).toContain('Estimable')
    expect(criteriaLabels).toContain('Small')
    expect(criteriaLabels).toContain('Testable')
  })

  it('flags vague terms', () => {
    const doc = makeDoc([
      makeNode({ id: 't1', title: 'UX', acceptanceCriteria: ['The UI should be fast and easy to use'] }),
    ])
    const result = validateAcQuality(doc, 't1')
    expect(result.nodes[0].vagueTerms.length).toBeGreaterThanOrEqual(2)
  })

  it('generates suggestions for vague ACs', () => {
    const doc = makeDoc([makeNode({ id: 't1', title: 'Perf', acceptanceCriteria: ['The system should be fast'] })])
    const result = validateAcQuality(doc, 't1')
    if (result.nodes[0].suggestions) {
      expect(result.nodes[0].suggestions.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('returns error summary when nodeId not found', () => {
    const doc = makeDoc([])
    const result = validateAcQuality(doc, 'nonexistent')
    expect(result.nodes).toEqual([])
    expect(result.overallScore).toBe(0)
  })

  it('includes child task nodes when validating a parent id', () => {
    const doc = makeDoc([
      makeNode({ id: 'e1', type: 'epic', title: 'Epic', acceptanceCriteria: ['Epic AC'] }),
      makeNode({ id: 't1', type: 'task', title: 'Task 1', parentId: 'e1', acceptanceCriteria: ['Task AC'] }),
    ])
    const result = validateAcQuality(doc, 'e1')
    expect(result.nodes.length).toBe(2)
  })

  it('handles acceptance_criteria child nodes', () => {
    const doc = makeDoc([
      makeNode({ id: 't1', type: 'task', title: 'Task' }),
      {
        ...makeNode({
          id: 'ac1',
          type: 'acceptance_criteria' as any,
          title: 'System should respond in under 200ms',
          parentId: 't1',
        }),
      },
    ])
    const result = validateAcQuality(doc, 't1')
    expect(result.nodes.length).toBe(1)
    expect(result.nodes[0].parsedAcs.length).toBeGreaterThanOrEqual(1)
  })
})
