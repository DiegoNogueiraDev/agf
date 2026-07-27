/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { detectMrdCandidates } from '../core/analyzer/merge-review-deprecate-detector.js'
import type { GraphDocument, GraphNode, GraphEdge } from '../core/graph/graph-types.js'

function makeNode(overrides: Partial<GraphNode>): GraphNode {
  return {
    id: 'n1',
    type: 'task',
    title: 'Default task',
    status: 'backlog',
    priority: 3,
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60_000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60_000).toISOString(),
    ...overrides,
  }
}

function makeEdge(overrides: Partial<GraphEdge>): GraphEdge {
  return {
    id: 'e1',
    from: 'a',
    to: 'b',
    relationType: 'related_to',
    ...overrides,
  }
}

function makeDoc(nodes: GraphNode[], edges: GraphEdge[] = []): GraphDocument {
  return {
    version: '1',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes,
    edges,
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

describe('detectMrdCandidates', () => {
  it('returns empty candidates for a minimal doc', () => {
    const doc = makeDoc([makeNode({ id: 't1', title: 'Unique task' })])
    const result = detectMrdCandidates(doc)
    expect(result.totalCandidates).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(result.merge)).toBe(true)
    expect(Array.isArray(result.review)).toBe(true)
    expect(Array.isArray(result.deprecate)).toBe(true)
  })

  describe('merge detection', () => {
    it('detects similar titles within same type', () => {
      const doc = makeDoc([
        makeNode({ id: 't1', type: 'task', title: 'ImplementLoginForm' }),
        makeNode({ id: 't2', type: 'task', title: 'ImplementLoginFormBackend' }),
      ])
      const result = detectMrdCandidates(doc)
      expect(result.merge.length).toBeGreaterThanOrEqual(1)
    })

    it('ignores done nodes for merge', () => {
      const doc = makeDoc([
        makeNode({ id: 't1', type: 'task', title: 'Implement login form', status: 'done' }),
        makeNode({ id: 't2', type: 'task', title: 'Implement login page', status: 'done' }),
      ])
      const result = detectMrdCandidates(doc)
      expect(result.merge.length).toBe(0)
    })

    it('does not merge nodes with dissimilar titles', () => {
      const doc = makeDoc([
        makeNode({ id: 't1', type: 'task', title: 'Setup database' }),
        makeNode({ id: 't2', type: 'task', title: 'Design landing page' }),
      ])
      const result = detectMrdCandidates(doc)
      expect(result.merge.length).toBe(0)
    })
  })

  describe('review detection', () => {
    it('flags stale in_progress tasks', () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60_000).toISOString()
      const doc = makeDoc([makeNode({ id: 't1', title: 'Stale task', status: 'in_progress', updatedAt: oldDate })])
      const result = detectMrdCandidates(doc)
      expect(result.review.some((r) => r.reason === 'stale_in_progress')).toBe(true)
    })

    it('flags blocked tasks whose blockers are all done', () => {
      const doc = makeDoc(
        [
          makeNode({ id: 't1', title: 'Blocked task', status: 'blocked', blocked: true }),
          makeNode({ id: 't2', title: 'Blocker done', status: 'done' }),
        ],
        [makeEdge({ from: 't1', to: 't2', relationType: 'depends_on' })],
      )
      const result = detectMrdCandidates(doc)
      expect(result.review.some((r) => r.reason === 'blocked_by_done')).toBe(true)
    })

    it('flags high-priority stale backlog', () => {
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60_000).toISOString()
      const doc = makeDoc([makeNode({ id: 't1', title: 'Important but stale', priority: 1, createdAt: oldDate })])
      const result = detectMrdCandidates(doc)
      expect(result.review.some((r) => r.reason === 'high_priority_stale')).toBe(true)
    })

    it('flags missing AC on non-done tasks', () => {
      const doc = makeDoc([makeNode({ id: 't1', title: 'No AC task' })])
      const result = detectMrdCandidates(doc)
      expect(result.review.some((r) => r.reason === 'missing_ac_critical')).toBe(true)
    })
  })

  describe('deprecate detection', () => {
    it('flags tagged deprecated nodes', () => {
      const doc = makeDoc([makeNode({ id: 't1', title: 'Old thing', tags: ['deprecated'] })])
      const result = detectMrdCandidates(doc)
      expect(result.deprecate.some((d) => d.reason === 'tagged_deprecated')).toBe(true)
    })

    it('flags orphan nodes with no parent and no edges', () => {
      const doc = makeDoc([makeNode({ id: 't1', title: 'Orphan node' })])
      const result = detectMrdCandidates(doc)
      expect(result.deprecate.some((d) => d.reason === 'orphan_no_edges')).toBe(true)
    })

    it('does not flag done nodes for orphan detection', () => {
      const doc = makeDoc([makeNode({ id: 't1', title: 'Done orphan', status: 'done' })])
      const result = detectMrdCandidates(doc)
      expect(result.deprecate.some((d) => d.reason === 'orphan_no_edges')).toBe(false)
    })
  })
})
