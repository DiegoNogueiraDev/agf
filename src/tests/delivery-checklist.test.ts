import { describe, it, expect } from 'vitest'
import { checkHandoffReadiness } from '../core/handoff/delivery-checklist.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: object[] = []): GraphDocument {
  return {
    version: 1,
    project: 'test',
    nodes: nodes as GraphDocument['nodes'],
    edges: [],
    indexes: { byId: {}, byType: {}, byStatus: {} },
    meta: {},
  } as unknown as GraphDocument
}

function makeTask(overrides: object = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    type: 'task',
    title: 'Task',
    status: 'done',
    acceptanceCriteria: ['ac1'],
    ...overrides,
  }
}

describe('checkHandoffReadiness', () => {
  it('returns a report with checks array', () => {
    const report = checkHandoffReadiness(makeDoc())
    expect(Array.isArray(report.checks)).toBe(true)
  })

  it('returns a score and grade', () => {
    const report = checkHandoffReadiness(makeDoc())
    expect(typeof report.score).toBe('number')
    expect(typeof report.grade).toBe('string')
  })

  it('passes all_tasks_done check when all tasks are done', () => {
    const doc = makeDoc([makeTask({ status: 'done' }), makeTask({ status: 'done' })])
    const report = checkHandoffReadiness(doc)
    const check = report.checks.find((c) => c.name === 'all_tasks_done')
    expect(check?.passed).toBe(true)
  })

  it('fails all_tasks_done check when tasks are pending', () => {
    const doc = makeDoc([makeTask({ status: 'done' }), makeTask({ status: 'ready' })])
    const report = checkHandoffReadiness(doc)
    const check = report.checks.find((c) => c.name === 'all_tasks_done')
    expect(check?.passed).toBe(false)
  })
})
