/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { buildValidatorReport } from '../core/validator/validator-report.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(
  nodes: Array<{ id: string; type?: string; status: string; blocked?: boolean }>,
  edges: Array<{ id: string; from: string; to: string; relationType: string }> = [],
): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type ?? 'task',
      status: n.status,
      title: `Task ${n.id}`,
      priority: 3,
      createdAt: '2026-06-01T00:00:00Z',
      updatedAt: '2026-06-23T00:00:00Z',
      acceptanceCriteria: [],
      blocked: n.blocked ?? false,
      metadata: {},
    })),
    edges: edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      relationType: e.relationType,
      createdAt: '2026-06-23T00:00:00Z',
    })),
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  } as unknown as GraphDocument
}

describe('buildValidatorReport', () => {
  it('returns the three checker sub-reports plus a hasFindings flag', () => {
    const report = buildValidatorReport(makeDoc([]))
    expect(typeof report.statusFlow.complianceRate).toBe('number')
    expect(typeof report.statusFlow.violations).toBe('number')
    expect(typeof report.doneIntegrity.passed).toBe('boolean')
    expect(typeof report.doneIntegrity.issues).toBe('number')
    expect(typeof report.edgeConsistency.passed).toBe('boolean')
    expect(typeof report.edgeConsistency.issues).toBe('number')
    expect(typeof report.hasFindings).toBe('boolean')
  })

  it('reports no findings for a clean graph', () => {
    const report = buildValidatorReport(makeDoc([{ id: 't1', status: 'done' }]))
    expect(report.doneIntegrity.passed).toBe(true)
    expect(report.edgeConsistency.passed).toBe(true)
    expect(report.hasFindings).toBe(false)
  })

  it('flags edge-consistency findings (self-loop)', () => {
    const doc = makeDoc(
      [{ id: 't1', status: 'backlog' }],
      [{ id: 'e1', from: 't1', to: 't1', relationType: 'depends_on' }],
    )
    const report = buildValidatorReport(doc)
    expect(report.edgeConsistency.issues).toBeGreaterThan(0)
    expect(report.edgeConsistency.passed).toBe(false)
    expect(report.hasFindings).toBe(true)
  })

  it('flags done-integrity findings (blocked but done)', () => {
    const doc = makeDoc([{ id: 't1', status: 'done', blocked: true }])
    const report = buildValidatorReport(doc)
    expect(report.doneIntegrity.issues).toBeGreaterThan(0)
    expect(report.hasFindings).toBe(true)
  })
})
