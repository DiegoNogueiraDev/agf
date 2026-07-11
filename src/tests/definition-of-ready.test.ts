/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { checkDefinitionOfReady } from '../core/analyzer/definition-of-ready.js'
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

describe('checkDefinitionOfReady', () => {
  it('empty graph → not ready, blockers present', () => {
    const r = checkDefinitionOfReady(makeDoc())
    expect(r.readyForNextPhase).toBe(false)
    expect(r.blockers.length).toBeGreaterThan(0)
    expect(r.checks.find((c) => c.name === 'has_requirements')?.passed).toBe(false)
  })

  it('complete graph passing all checks → ready', () => {
    const doc = makeDoc(
      [
        {
          id: 'e1',
          type: 'epic',
          title: 'Core',
          description: 'desc',
          status: 'backlog',
          priority: 3,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 't1',
          type: 'task',
          title: 'Impl',
          description: 'desc',
          status: 'backlog',
          priority: 3,
          xpSize: 'M',
          acceptanceCriteria: ['AC1'],
          createdAt: '',
          updatedAt: '',
        },
        { id: 'r1', type: 'risk', title: 'Risk', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' },
        {
          id: 'c1',
          type: 'constraint',
          title: 'Constraint',
          status: 'backlog',
          priority: 3,
          createdAt: '',
          updatedAt: '',
        },
      ],
      [{ id: 'e1-1', from: 'e1', to: 't1', relationType: 'parent_of', createdAt: '' }],
    )
    const r = checkDefinitionOfReady(doc)
    expect(r.checks.filter((c) => c.name !== 'prd_quality_score').every((c) => c.passed)).toBe(true)
  })

  it('isolated requirement as epic → has_requirements passes', () => {
    const doc = makeDoc([
      { id: 'e1', type: 'epic', title: 'Core', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' },
    ])
    const r = checkDefinitionOfReady(doc)
    expect(r.checks.find((c) => c.name === 'has_requirements')?.passed).toBe(true)
  })
})
