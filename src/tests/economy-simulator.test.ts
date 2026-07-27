/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { simulateEconomy } from '../core/analyzer/economy-simulator.js'
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

describe('simulateEconomy', () => {
  const baseParams = { playerCount: 100, avgSessionHours: 4, avgLevel: 25 }

  it('no economy-related nodes → no flows, zero totals', () => {
    const r = simulateEconomy(makeDoc(), baseParams)
    expect(r.flows).toEqual([])
    expect(r.totalInflowPerDay).toBe(0)
    expect(r.totalOutflowPerDay).toBe(0)
    expect(r.netFlowPerDay).toBe(0)
    expect(r.inflationRisk).toBe('none')
  })

  it('formula node with economy keywords and rate → inflow flow', () => {
    const doc = makeDoc([
      {
        id: 'f1',
        type: 'formula',
        title: 'Quest Reward Gold',
        status: 'backlog',
        priority: 3,
        metadata: { expression: '100 * level', rate: 50 },
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = simulateEconomy(doc, baseParams)
    expect(r.flows.length).toBeGreaterThan(0)
    expect(r.flows[0].type).toBe('inflow')
    expect(r.totalInflowPerDay).toBeGreaterThan(0)
  })

  it('economy node without formula → estimated flows with warning', () => {
    const doc = makeDoc([
      {
        id: 't1',
        type: 'task',
        title: 'Gold Reward System',
        description: 'quest reward gives 200 gold',
        status: 'backlog',
        priority: 3,
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = simulateEconomy(doc, baseParams)
    expect(r.warnings.some((w) => w.includes('No formula nodes'))).toBe(true)
    expect(r.flows.some((f) => f.source === 'estimated')).toBe(true)
  })

  it('high inflation when inflow >> outflow → critical risk + suggestions', () => {
    const doc = makeDoc([
      {
        id: 'f1',
        type: 'formula',
        title: 'Quest Reward',
        status: 'backlog',
        priority: 3,
        metadata: { expression: '100 * level', rate: 200 },
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = simulateEconomy(doc, baseParams)
    expect(r.inflationRisk).toBe('critical')
    expect(r.suggestions.length).toBeGreaterThan(0)
    expect(r.warnings.some((w) => w.includes('No formula'))).toBe(false) // formula was found
  })

  it('outflow formula node detected correctly', () => {
    const doc = makeDoc([
      {
        id: 'f1',
        type: 'formula',
        title: 'Repair Cost',
        description: 'item repair cost sink',
        status: 'backlog',
        priority: 3,
        metadata: { expression: '50 * level', rate: 30 },
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = simulateEconomy(doc, baseParams)
    expect(r.flows.some((f) => f.type === 'outflow')).toBe(true)
    expect(r.totalOutflowPerDay).toBeGreaterThan(0)
  })

  it('no gold sinks detected → suggestion added', () => {
    const doc = makeDoc([
      {
        id: 'f1',
        type: 'formula',
        title: 'Daily Reward',
        description: 'quest reward income',
        status: 'backlog',
        priority: 3,
        metadata: { expression: '100', rate: 50 },
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = simulateEconomy(doc, baseParams)
    expect(r.suggestions.some((s) => s.toLowerCase().includes('gold sink'))).toBe(true)
  })
})
