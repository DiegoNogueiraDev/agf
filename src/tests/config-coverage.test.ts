/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { analyzeConfigCoverage } from '../core/analyzer/config-coverage.js'
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

describe('analyzeConfigCoverage', () => {
  it('no config_schema nodes → 100% coverage', () => {
    const r = analyzeConfigCoverage(makeDoc())
    expect(r.totalConfigs).toBe(0)
    expect(r.coveragePercent).toBe(100)
  })

  it('config_schema with non-empty referencedBy → covered', () => {
    const doc = makeDoc([
      {
        id: 'cfg1',
        type: 'config_schema',
        title: 'database',
        status: 'backlog',
        priority: 3,
        metadata: { referencedBy: ['task-1'] },
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzeConfigCoverage(doc)
    expect(r.totalConfigs).toBe(1)
    expect(r.orphanConfigs).toEqual([])
    expect(r.coveragePercent).toBe(100)
  })

  it('config_schema without referencedBy → orphan', () => {
    const doc = makeDoc([
      {
        id: 'cfg1',
        type: 'config_schema',
        title: 'orphan-config',
        status: 'backlog',
        priority: 3,
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzeConfigCoverage(doc)
    expect(r.orphanConfigs).toHaveLength(1)
    expect(r.orphanConfigs[0].title).toBe('orphan-config')
    expect(r.coveragePercent).toBe(0)
  })

  it('referencedBy pointing to undefined node → listed', () => {
    const doc = makeDoc([
      {
        id: 'cfg1',
        type: 'config_schema',
        title: 'db',
        status: 'backlog',
        priority: 3,
        metadata: { referencedBy: ['non-existent-id'] },
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzeConfigCoverage(doc)
    expect(r.referencedButUndefined).toContain('non-existent-id')
  })
})
