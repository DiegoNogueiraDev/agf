/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { analyzeContractCoverage } from '../core/analyzer/contract-coverage.js'
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

describe('analyzeContractCoverage', () => {
  it('no contract nodes → 100% coverage', () => {
    const r = analyzeContractCoverage(makeDoc())
    expect(r.totalContracts).toBe(0)
    expect(r.coveragePercent).toBe(100)
  })

  it('contract with both provides and consumes edges → covered', () => {
    const doc = makeDoc(
      [
        {
          id: 'c1',
          type: 'contract',
          title: 'API Contract',
          status: 'backlog',
          priority: 3,
          createdAt: '',
          updatedAt: '',
        },
      ],
      [
        { id: 'e1', from: 'svc1', to: 'c1', relationType: 'provides', createdAt: '' },
        { id: 'e2', from: 'svc2', to: 'c1', relationType: 'consumes', createdAt: '' },
      ],
    )
    const r = analyzeContractCoverage(doc)
    expect(r.totalContracts).toBe(1)
    expect(r.uncoveredContracts).toEqual([])
    expect(r.coveragePercent).toBe(100)
    expect(r.contracts[0].hasProvider).toBe(true)
    expect(r.contracts[0].hasConsumer).toBe(true)
  })

  it('contract without any edges → uncovered', () => {
    const doc = makeDoc([
      {
        id: 'c1',
        type: 'contract',
        title: 'Lonely Contract',
        status: 'backlog',
        priority: 3,
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzeContractCoverage(doc)
    expect(r.uncoveredContracts).toContain('c1')
    expect(r.coveragePercent).toBe(0)
  })

  it('contract with only one edge → uncovered', () => {
    const doc = makeDoc(
      [{ id: 'c1', type: 'contract', title: 'Partial', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' }],
      [{ id: 'e1', from: 'svc1', to: 'c1', relationType: 'provides', createdAt: '' }],
    )
    const r = analyzeContractCoverage(doc)
    expect(r.uncoveredContracts).toContain('c1')
    expect(r.contracts[0].hasProvider).toBe(true)
    expect(r.contracts[0].hasConsumer).toBe(false)
  })
})
