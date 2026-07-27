/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { analyzeStateCompleteness } from '../core/analyzer/state-completeness.js'
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

describe('analyzeStateCompleteness', () => {
  it('no state_machine nodes → empty report', () => {
    const r = analyzeStateCompleteness(makeDoc())
    expect(r.machines).toEqual([])
    expect(r.totalMachines).toBe(0)
    expect(r.validCount).toBe(0)
  })

  it('valid state machine (all states have outgoing) → valid', () => {
    const doc = makeDoc([
      {
        id: 'sm1',
        type: 'state_machine',
        title: 'Cycle',
        status: 'backlog',
        priority: 3,
        metadata: {
          states: ['idle', 'active', 'completed'],
          transitions: [
            { from: 'idle', to: 'active' },
            { from: 'active', to: 'completed' },
            { from: 'completed', to: 'idle' },
          ],
          initialState: 'idle',
        },
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzeStateCompleteness(doc)
    expect(r.totalMachines).toBe(1)
    expect(r.validCount).toBe(1)
    expect(r.machines[0].valid).toBe(true)
  })

  it('state machine with dead state → issues', () => {
    const doc = makeDoc([
      {
        id: 'sm1',
        type: 'state_machine',
        title: 'Dead States',
        status: 'backlog',
        priority: 3,
        metadata: {
          states: ['alive', 'dead', 'waiting'],
          transitions: [{ from: 'alive', to: 'dead' }],
          initialState: 'alive',
        },
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzeStateCompleteness(doc)
    expect(r.machines[0].valid).toBe(false)
    expect(r.machines[0].issues.some((i) => i.includes('Dead state'))).toBe(true)
    expect(r.machines[0].issues.some((i) => i.includes('waiting'))).toBe(true)
  })

  it('state machine with missing metadata → issues for each missing field', () => {
    const doc = makeDoc([
      {
        id: 'sm1',
        type: 'state_machine',
        title: 'Empty',
        status: 'backlog',
        priority: 3,
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = analyzeStateCompleteness(doc)
    expect(r.machines[0].valid).toBe(false)
    expect(r.machines[0].issues.length).toBeGreaterThanOrEqual(2)
  })
})
