import { describe, it, expect } from 'vitest'
import { calculateVelocity } from '../core/planner/velocity.js'
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
    xpSize: 'M',
    sprint: 'sprint-1',
    ...overrides,
  }
}

describe('calculateVelocity', () => {
  it('returns zero overall when document has no done tasks', () => {
    const doc = makeDoc([makeTask({ status: 'ready' })])
    const summary = calculateVelocity(doc)
    expect(summary.overall.totalTasksCompleted).toBe(0)
    expect(summary.sprints).toHaveLength(0)
  })

  it('groups done tasks by sprint', () => {
    const doc = makeDoc([
      makeTask({ sprint: 'sprint-1' }),
      makeTask({ sprint: 'sprint-1' }),
      makeTask({ sprint: 'sprint-2' }),
    ])
    const summary = calculateVelocity(doc)
    expect(summary.sprints).toHaveLength(2)
    const s1 = summary.sprints.find((s) => s.sprint === 'sprint-1')
    expect(s1?.tasksCompleted).toBe(2)
  })

  it('counts totalTasksCompleted in overall', () => {
    const doc = makeDoc([makeTask(), makeTask(), makeTask()])
    const summary = calculateVelocity(doc)
    expect(summary.overall.totalTasksCompleted).toBe(3)
  })

  it('filters by sprintId when provided', () => {
    const doc = makeDoc([makeTask({ sprint: 'sprint-1' }), makeTask({ sprint: 'sprint-2' })])
    const summary = calculateVelocity(doc, { sprintId: 'sprint-1' })
    expect(summary.sprints.every((s) => s.sprint === 'sprint-1')).toBe(true)
  })

  it('includes byCategory breakdown', () => {
    const doc = makeDoc([makeTask({ tags: ['feature'] })])
    const summary = calculateVelocity(doc)
    expect(Array.isArray(summary.byCategory)).toBe(true)
  })
})
