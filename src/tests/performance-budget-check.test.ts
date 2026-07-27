/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { analyzePerformanceBudgets } from '../core/analyzer/performance-budget-check.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: GraphDocument['nodes'] = []): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes,
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

describe('analyzePerformanceBudgets', () => {
  it('no performance_budget nodes → empty report', () => {
    const r = analyzePerformanceBudgets(makeDoc())
    expect(r.budgets).toEqual([])
    expect(r.totalBudgets).toBe(0)
    expect(r.untestedCount).toBe(0)
  })

  it('budget with metric and threshold → parsed correctly', () => {
    const doc = makeDoc([
      {
        id: 'b1',
        type: 'performance_budget',
        title: 'LCP',
        status: 'backlog',
        priority: 3,
        metadata: { metricName: 'LCP', threshold: '2.5s', status: 'passing' },
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzePerformanceBudgets(doc)
    expect(r.budgets[0].metric).toBe('LCP')
    expect(r.budgets[0].threshold).toBe('2.5s')
    expect(r.budgets[0].status).toBe('passing')
  })

  it('budget without status → defaults to untested', () => {
    const doc = makeDoc([
      {
        id: 'b1',
        type: 'performance_budget',
        title: 'TTI',
        status: 'backlog',
        priority: 3,
        metadata: { metricName: 'TTI', threshold: '3s' },
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzePerformanceBudgets(doc)
    expect(r.budgets[0].status).toBe('untested')
    expect(r.untestedCount).toBe(1)
  })

  it('budget with number threshold → converted to string', () => {
    const doc = makeDoc([
      {
        id: 'b1',
        type: 'performance_budget',
        title: 'FID',
        status: 'backlog',
        priority: 3,
        metadata: { metricName: 'FID', threshold: 100 },
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzePerformanceBudgets(doc)
    expect(r.budgets[0].threshold).toBe('100')
  })
})
