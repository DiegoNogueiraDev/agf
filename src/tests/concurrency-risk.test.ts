/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { analyzeConcurrencyRisk } from '../core/analyzer/concurrency-risk.js'
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

describe('analyzeConcurrencyRisk', () => {
  it('no tasks → empty report', () => {
    const r = analyzeConcurrencyRisk(makeDoc())
    expect(r.totalRisks).toBe(0)
    expect(r.risks).toEqual([])
  })

  it('task with concurrency keywords → risk detected', () => {
    const doc = makeDoc([
      {
        id: 't1',
        type: 'task',
        title: 'Trade System',
        description: 'handle concurrent gold transactions',
        status: 'backlog',
        priority: 3,
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzeConcurrencyRisk(doc)
    expect(r.totalRisks).toBe(1)
    expect(r.risks[0].matchedKeywords).toContain('trade')
    expect(r.risks[0].matchedKeywords).toContain('concurrent')
    expect(r.risks[0].suggestedTests.length).toBeGreaterThan(0)
  })

  it('task with no concurrency keywords → no risk', () => {
    const doc = makeDoc([
      {
        id: 't1',
        type: 'task',
        title: 'Simple UI',
        description: 'render a button',
        status: 'backlog',
        priority: 3,
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzeConcurrencyRisk(doc)
    expect(r.totalRisks).toBe(0)
  })

  it('tasks sharing significant keywords → entity conflict', () => {
    const doc = makeDoc([
      {
        id: 't1',
        type: 'task',
        title: 'Gold Trade',
        description: 'trade gold between players',
        status: 'backlog',
        priority: 3,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 't2',
        type: 'task',
        title: 'Gold Farming',
        description: 'automated gold generation',
        status: 'backlog',
        priority: 3,
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzeConcurrencyRisk(doc)
    // Both have "gold" and "trade" keywords — first triggers risk, second shares entity
    expect(r.entityConflicts.length).toBeGreaterThan(0)
  })
})
