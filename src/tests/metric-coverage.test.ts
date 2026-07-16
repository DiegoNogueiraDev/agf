/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { analyzeMetricCoverage } from '../core/analyzer/metric-coverage.js'
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

describe('analyzeMetricCoverage', () => {
  it('no metrics and no high risks → 100% coverage', () => {
    const r = analyzeMetricCoverage(makeDoc())
    expect(r.totalMetrics).toBe(0)
    expect(r.totalHighRisks).toBe(0)
    expect(r.coveragePercent).toBe(100)
  })

  it('high-priority risk without linked metric → uncovered', () => {
    const doc = makeDoc([
      {
        id: 'r1',
        type: 'risk',
        title: 'Security breach',
        priority: 1,
        status: 'backlog',
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzeMetricCoverage(doc)
    expect(r.totalHighRisks).toBe(1)
    expect(r.uncoveredRisks).toHaveLength(1)
    expect(r.coveragePercent).toBe(0)
  })

  it('low-priority risk (priority > 2) → not counted as high risk', () => {
    const doc = makeDoc([
      { id: 'r1', type: 'risk', title: 'Minor issue', priority: 4, status: 'backlog', createdAt: '', updatedAt: '' },
    ])
    const r = analyzeMetricCoverage(doc)
    expect(r.totalHighRisks).toBe(0)
  })

  it('risk linked to metric via edge → covered', () => {
    const doc = makeDoc(
      [
        { id: 'r1', type: 'risk', title: 'Performance', priority: 1, status: 'backlog', createdAt: '', updatedAt: '' },
        {
          id: 'm1',
          type: 'metric',
          title: 'p99 latency',
          status: 'backlog',
          priority: 3,
          createdAt: '',
          updatedAt: '',
        },
      ],
      [{ id: 'e1', from: 'r1', to: 'm1', relationType: 'related_to', createdAt: '' }],
    )
    const r = analyzeMetricCoverage(doc)
    expect(r.totalHighRisks).toBe(1)
    expect(r.coveredRisks).toContain('r1')
    expect(r.coveragePercent).toBe(100)
  })
})
