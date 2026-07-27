/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { analyzePrdQuality } from '../core/analyzer/prd-quality.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(overrides: Partial<GraphDocument> = {}): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes: [],
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
    ...overrides,
  }
}

describe('analyzePrdQuality', () => {
  it('empty graph → score 0, grade F, missing all sections', () => {
    const r = analyzePrdQuality(makeDoc())
    expect(r.score).toBe(0)
    expect(r.grade).toBe('F')
    expect(r.readyForDesign).toBe(false)
    expect(r.sections.every((s) => s.quality === 'missing')).toBe(true)
  })

  it('complete graph with all sections → score >= 60, ready for design', () => {
    const doc = makeDoc({
      nodes: [
        {
          id: 'e1',
          type: 'epic',
          title: 'Core',
          description: 'desc',
          status: 'backlog',
          priority: 3,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 't1',
          type: 'task',
          title: 'Impl',
          description: 'desc',
          status: 'backlog',
          priority: 3,
          xpSize: 'M',
          estimateMinutes: 60,
          acceptanceCriteria: ['AC1'],
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 't2',
          type: 'subtask',
          title: 'Sub',
          description: 'desc',
          status: 'backlog',
          priority: 3,
          xpSize: 'S',
          acceptanceCriteria: ['AC2'],
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'r1',
          type: 'risk',
          title: 'Security risk',
          status: 'backlog',
          priority: 2,
          createdAt: '',
          updatedAt: '',
        },
        { id: 'r2', type: 'risk', title: 'Perf risk', status: 'backlog', priority: 3, createdAt: '', updatedAt: '' },
        {
          id: 'c1',
          type: 'constraint',
          title: 'Must use TS',
          status: 'backlog',
          priority: 3,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'c2',
          type: 'constraint',
          title: 'Must scale',
          status: 'backlog',
          priority: 3,
          createdAt: '',
          updatedAt: '',
        },
      ],
    })
    const r = analyzePrdQuality(doc)
    expect(r.score).toBeGreaterThanOrEqual(60)
    expect(r.readyForDesign).toBe(true)
    expect(r.sections.find((s) => s.name === 'requirements')?.quality).toBe('strong')
    expect(r.sections.find((s) => s.name === 'tasks')?.quality).toBe('strong')
  })

  it('graph with only epic but no tasks/risks/constraints → has issues', () => {
    const doc = makeDoc({
      nodes: [
        {
          id: 'e1',
          type: 'epic',
          title: 'Core',
          description: 'desc',
          status: 'backlog',
          priority: 3,
          createdAt: '',
          updatedAt: '',
        },
      ],
    })
    const r = analyzePrdQuality(doc)
    expect(r.score).toBeLessThan(60)
    expect(r.readyForDesign).toBe(false)
    const tasksSection = r.sections.find((s) => s.name === 'tasks')
    expect(tasksSection?.issues).toContain('Nenhuma task definida')
  })
})
