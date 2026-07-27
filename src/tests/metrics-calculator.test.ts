import { describe, it, expect } from 'vitest'
import { calculateMetrics } from '../core/insights/metrics-calculator.js'
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
    status: 'ready',
    xpSize: 'M',
    ...overrides,
  }
}

describe('calculateMetrics', () => {
  it('returns zero totals for empty document', () => {
    const report = calculateMetrics(makeDoc())
    expect(report.totalNodes).toBe(0)
    expect(report.totalTasks).toBe(0)
    expect(report.completionRate).toBe(0)
  })

  it('counts total nodes including non-tasks', () => {
    const doc = makeDoc([makeTask(), { id: 'e1', type: 'epic', title: 'Epic', status: 'ready' }])
    const report = calculateMetrics(doc)
    expect(report.totalNodes).toBe(2)
    expect(report.totalTasks).toBe(1)
  })

  it('computes completion rate from done tasks', () => {
    const doc = makeDoc([makeTask({ status: 'done' }), makeTask({ status: 'done' }), makeTask({ status: 'ready' })])
    const report = calculateMetrics(doc)
    expect(report.completionRate).toBe(67)
  })

  it('includes statusDistribution for all statuses', () => {
    const doc = makeDoc([makeTask({ status: 'done' }), makeTask({ status: 'blocked' })])
    const report = calculateMetrics(doc)
    const statuses = report.statusDistribution.map((s) => s.status)
    expect(statuses).toContain('done')
    expect(statuses).toContain('blocked')
  })

  it('includes velocity with tasksCompleted', () => {
    const doc = makeDoc([makeTask({ status: 'done' })])
    const report = calculateMetrics(doc)
    expect(typeof report.velocity.tasksCompleted).toBe('number')
  })
})
