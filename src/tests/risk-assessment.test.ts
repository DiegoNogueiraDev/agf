/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { assessRisks } from '../core/analyzer/risk-assessment.js'
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

describe('assessRisks', () => {
  it('no risk nodes → empty matrix', () => {
    const r = assessRisks(makeDoc())
    expect(r.risks).toEqual([])
    expect(r.summary.total).toBe(0)
  })

  it('risk with high-probability + high-impact keywords → critical level', () => {
    const doc = makeDoc([
      {
        id: 'r1',
        type: 'risk',
        title: 'Data loss critical',
        description: 'sempre provável',
        status: 'backlog',
        priority: 1,
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = assessRisks(doc)
    expect(r.risks).toHaveLength(1)
    expect(r.risks[0].level).toBe('critical')
    expect(r.risks[0].probability).toBeGreaterThanOrEqual(4)
    expect(r.risks[0].impact).toBeGreaterThanOrEqual(4)
  })

  it('risk with default keywords → medium level', () => {
    const doc = makeDoc([
      {
        id: 'r1',
        type: 'risk',
        title: 'General risk',
        description: 'some issue',
        status: 'backlog',
        priority: 3,
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = assessRisks(doc)
    // Default: probability=3, impact=3 → score=9 → 'high'
    expect(r.risks[0].level).toBe('high')
  })

  it('risk with mitigated child tasks → mitigationStatus mitigated', () => {
    const doc = makeDoc([
      { id: 'r1', type: 'risk', title: 'Security risk', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' },
      {
        id: 't1',
        type: 'task',
        title: 'Fix',
        status: 'done',
        parentId: 'r1',
        priority: 3,
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = assessRisks(doc)
    expect(r.risks[0].mitigationStatus).toBe('mitigated')
  })

  it('risks sorted by score descending', () => {
    const doc = makeDoc([
      {
        id: 'r1',
        type: 'risk',
        title: 'Minor risk',
        description: 'cosmético menor',
        status: 'backlog',
        priority: 5,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'r2',
        type: 'risk',
        title: 'Critical security',
        description: 'critical data loss',
        status: 'backlog',
        priority: 1,
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = assessRisks(doc)
    expect(r.risks[0].score).toBeGreaterThanOrEqual(r.risks[1].score)
  })
})
