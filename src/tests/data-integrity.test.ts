/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { analyzeDataIntegrity } from '../core/analyzer/data-integrity.js'
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

describe('analyzeDataIntegrity', () => {
  it('no data_table nodes → registrationRequired true', () => {
    const r = analyzeDataIntegrity(makeDoc())
    expect(r.registrationRequired).toBe(true)
    expect(r.totalTables).toBe(0)
  })

  it('valid data_table with columns → valid', () => {
    const doc = makeDoc([
      {
        id: 'd1',
        type: 'data_table',
        title: 'Drop Rates',
        status: 'backlog',
        priority: 3,
        metadata: { columns: ['item', 'probability', 'cost'] },
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzeDataIntegrity(doc)
    expect(r.totalTables).toBe(1)
    expect(r.validCount).toBe(1)
    expect(r.tables[0].valid).toBe(true)
  })

  it('data_table with probability sum != 1 → issues reported', () => {
    const doc = makeDoc([
      {
        id: 'd1',
        type: 'data_table',
        title: 'Drop Rates',
        status: 'backlog',
        priority: 3,
        metadata: {
          columns: ['item', 'probability'],
          rowsPreview: [
            { item: 'sword', probability: 0.6 },
            { item: 'shield', probability: 0.5 },
          ],
        },
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzeDataIntegrity(doc)
    expect(r.tables[0].valid).toBe(false)
    expect(r.tables[0].issues.some((i) => i.includes('probability'))).toBe(true)
  })

  it('data_table with non-positive cost → issues reported', () => {
    const doc = makeDoc([
      {
        id: 'd1',
        type: 'data_table',
        title: 'Prices',
        status: 'backlog',
        priority: 3,
        metadata: {
          columns: ['item', 'cost'],
          rowsPreview: [{ item: 'potion', cost: -5 }],
        },
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzeDataIntegrity(doc)
    expect(r.tables[0].valid).toBe(false)
    expect(r.tables[0].issues.some((i) => i.includes('non-positive'))).toBe(true)
  })
})
