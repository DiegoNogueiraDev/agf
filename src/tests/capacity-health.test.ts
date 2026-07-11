/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { computeCapacityHealth } from '../core/analyzer/capacity-health.js'
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

describe('computeCapacityHealth', () => {
  it('no sprint data → trivial pass with null sprintLabel', () => {
    const r = computeCapacityHealth(makeDoc())
    expect(r.sprintLabel).toBeNull()
    expect(r.withinTolerance).toBe(true)
    expect(r.reason).toContain('Nenhum sprint detectado')
  })

  it('sprint with tasks but no prior velocity → not within tolerance (no history)', () => {
    const doc = makeDoc([
      {
        id: 't1',
        type: 'task',
        title: 'A',
        status: 'in_progress',
        sprint: 'S1',
        xpSize: 'M',
        priority: 3,
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = computeCapacityHealth(doc, 'S1')
    expect(r.sprintLabel).toBe('S1')
    expect(r.withinTolerance).toBe(false)
    expect(r.reason).toContain('Sem velocity')
  })

  it('sprint with explicit label and done prior sprint → computes delta', () => {
    const doc = makeDoc([
      {
        id: 't1',
        type: 'task',
        title: 'Done task',
        status: 'done',
        sprint: 'S0',
        xpSize: 'M',
        priority: 3,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
      },
      {
        id: 't2',
        type: 'task',
        title: 'Planned',
        status: 'in_progress',
        sprint: 'S1',
        xpSize: 'M',
        priority: 3,
        createdAt: '',
        updatedAt: '',
      },
    ])
    const r = computeCapacityHealth(doc, 'S1')
    expect(r.sprintLabel).toBe('S1')
    expect(typeof r.deltaPct).toBe('number')
  })
})
