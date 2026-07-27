/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { analyzeScenarioCoverage } from '../core/analyzer/scenario-coverage.js'
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

describe('analyzeScenarioCoverage', () => {
  it('no scenarios and no epics/tasks → 100% coverage trivially', () => {
    const r = analyzeScenarioCoverage(makeDoc())
    expect(r.totalScenarios).toBe(0)
    expect(r.coveragePercent).toBe(100)
  })

  it('epics without scenario coverage → 0%', () => {
    const doc = makeDoc([
      { id: 'e1', type: 'epic', title: 'Auth System', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' },
    ])
    const r = analyzeScenarioCoverage(doc)
    expect(r.systemsUncovered).toContain('auth system')
    expect(r.coveragePercent).toBe(0)
  })

  it('scenario covering a system → partial coverage', () => {
    const doc = makeDoc([
      { id: 'e1', type: 'epic', title: 'Auth System', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' },
      {
        id: 's1',
        type: 'scenario',
        title: 'Login flow',
        status: 'backlog',
        priority: 3,
        metadata: { systemsInvolved: ['Auth System'] },
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzeScenarioCoverage(doc)
    expect(r.systemsCovered).toContain('auth system')
    expect(r.coveragePercent).toBe(100)
  })
})
