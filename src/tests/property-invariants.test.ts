/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { getBuiltInInvariants, checkInvariants } from '../core/harness/property-invariants.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

const makeDoc = (overrides?: Partial<GraphDocument>): GraphDocument => ({
  version: '1',
  project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
  nodes: [],
  edges: [],
  indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
  meta: { sourceFiles: [], lastImport: null },
  ...overrides,
})

describe('getBuiltInInvariants', () => {
  it('returns 3 invariants', () => {
    const invs = getBuiltInInvariants()
    expect(invs).toHaveLength(3)
    expect(invs[0].id).toBe('referential_integrity')
    expect(invs[1].id).toBe('status_monotonicity')
    expect(invs[2].id).toBe('dag_acyclicity')
  })
})

describe('checkInvariants', () => {
  it('passes for well-formed graph', () => {
    const doc = makeDoc({
      nodes: [{ id: 'n1', type: 'task', title: 'T1', status: 'done', priority: 3, createdAt: '', updatedAt: '' }],
      edges: [],
    })
    const r = checkInvariants(doc, getBuiltInInvariants())
    expect(r.passed).toBe(true)
    expect(r.violations).toHaveLength(0)
  })

  it('detects referential integrity violation', () => {
    const doc = makeDoc({
      nodes: [{ id: 'n1', type: 'task', title: 'T1', status: 'done', priority: 3, createdAt: '', updatedAt: '' }],
      edges: [{ id: 'e1', from: 'n1', to: 'nonexistent', relationType: 'depends_on', createdAt: '' }],
    })
    const r = checkInvariants(doc, getBuiltInInvariants())
    expect(r.passed).toBe(false)
    const refV = r.violations.find((v) => v.invariantId === 'referential_integrity')
    expect(refV).toBeDefined()
    expect(refV!.message).toContain("to='nonexistent'")
  })

  it('detects status regression', () => {
    const doc = makeDoc({
      nodes: [
        {
          id: 'n1',
          type: 'task',
          title: 'T1',
          status: 'in_progress',
          priority: 3,
          metadata: { previousStatus: 'done' },
          createdAt: '',
          updatedAt: '',
        },
      ],
    })
    const r = checkInvariants(doc, getBuiltInInvariants())
    expect(r.passed).toBe(false)
    expect(r.violations.some((v) => v.invariantId === 'status_monotonicity')).toBe(true)
  })

  it('handles errors gracefully', () => {
    const brokenInvariant = {
      id: 'crash',
      name: 'Crash',
      description: 'Always throws',
      severity: 'error' as const,
      check: () => {
        throw new Error('boom')
      },
    }
    const r = checkInvariants(makeDoc(), [brokenInvariant])
    expect(r.passed).toBe(true)
    expect(r.checkedInvariants).toBe(1)
  })

  it('reports durationMs', () => {
    const doc = makeDoc()
    const r = checkInvariants(doc, getBuiltInInvariants())
    expect(r.durationMs).toBeGreaterThanOrEqual(0)
  })
})
