/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { analyzeScope } from '../core/analyzer/scope-analyzer.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: GraphDocument['nodes'] = [], edges: GraphDocument['edges'] = []): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes,
    edges,
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

describe('analyzeScope', () => {
  it('empty graph → no orphans, no cycles, clean summary', () => {
    const r = analyzeScope(makeDoc())
    expect(r.orphans).toEqual([])
    expect(r.cycles).toEqual([])
    expect(r.conflicts).toEqual([])
    expect(r.summary).toContain('limpo')
  })

  it('requirement without tasks or edges → orphan', () => {
    const doc = makeDoc([
      { id: 'r1', type: 'requirement', title: 'Req', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' },
    ])
    const r = analyzeScope(doc)
    expect(r.coverage.orphanRequirementsCount).toBe(1)
    expect(r.orphans.length).toBeGreaterThanOrEqual(1)
  })

  it('task without parent or edges → orphan task', () => {
    const doc = makeDoc([
      { id: 't1', type: 'task', title: 'Orphan task', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' },
    ])
    const r = analyzeScope(doc)
    expect(r.coverage.orphanTasks).toBe(1)
  })

  it('cycle detection for depends_on edges', () => {
    const doc = makeDoc(
      [
        { id: 't1', type: 'task', title: 'Task A', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' },
        { id: 't2', type: 'task', title: 'Task B', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' },
      ],
      [
        { id: 'e1', from: 't1', to: 't2', relationType: 'depends_on', createdAt: '' },
        { id: 'e2', from: 't2', to: 't1', relationType: 'depends_on', createdAt: '' },
      ],
    )
    const r = analyzeScope(doc)
    expect(r.cycles.length).toBeGreaterThan(0)
  })

  it('conflicting constraints detected', () => {
    const doc = makeDoc([
      {
        id: 'c1',
        type: 'constraint',
        title: 'Alta performance',
        status: 'backlog',
        priority: 3,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'c2',
        type: 'constraint',
        title: 'Muita funcionalidade',
        status: 'backlog',
        priority: 3,
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzeScope(doc)
    expect(r.conflicts.length).toBeGreaterThan(0)
  })
})
