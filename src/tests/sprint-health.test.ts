import { describe, it, expect } from 'vitest'
import { analyzeSprintHealth } from '../core/planner/sprint-health.js'
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
    acceptanceCriteria: ['ac1'],
    ...overrides,
  }
}

describe('analyzeSprintHealth', () => {
  it('returns healthy for empty document', () => {
    const report = analyzeSprintHealth(makeDoc())
    expect(report.health).toBe('healthy')
    expect(report.metrics.totalPoints).toBe(0)
    expect(report.metrics.taskCount).toBe(0)
  })

  it('computes taskCount and doneCount', () => {
    const doc = makeDoc([makeTask({ status: 'done' }), makeTask({ status: 'ready' })])
    const report = analyzeSprintHealth(doc)
    expect(report.metrics.taskCount).toBe(2)
    expect(report.metrics.doneCount).toBe(1)
  })

  it('marks at_risk when more than 10% blocked', () => {
    const tasks = [
      makeTask({ status: 'blocked' }),
      makeTask({ status: 'ready' }),
      makeTask({ status: 'ready' }),
      makeTask({ status: 'ready' }),
      makeTask({ status: 'ready' }),
      makeTask({ status: 'ready' }),
      makeTask({ status: 'ready' }),
      makeTask({ status: 'ready' }),
      makeTask({ status: 'ready' }),
      makeTask({ status: 'ready' }),
      makeTask({ status: 'ready' }),
    ]
    const report = analyzeSprintHealth(makeDoc(tasks))
    expect(['at_risk', 'critical']).toContain(report.health)
  })

  it('marks critical when more than 30% blocked', () => {
    const tasks = Array.from({ length: 4 }, (_, i) => makeTask({ status: i < 2 ? 'blocked' : 'ready' }))
    const report = analyzeSprintHealth(makeDoc(tasks))
    expect(report.health).toBe('critical')
  })

  it('filters by sprintFilter when provided', () => {
    const doc = makeDoc([makeTask({ sprint: 'sprint-1' }), makeTask({ sprint: 'sprint-2' })])
    const report = analyzeSprintHealth(doc, 'sprint-1')
    expect(report.metrics.taskCount).toBe(1)
  })

  describe('BUG-03 — AC coverage via child acceptance_criteria nodes', () => {
    it('counts a task with inline acceptanceCriteria as having AC', () => {
      const doc = makeDoc([makeTask({ acceptanceCriteria: ['inline ac'] })])
      const report = analyzeSprintHealth(doc)
      expect(report.metrics.tasksWithoutAC).toBe(0)
    })

    it('counts a task whose AC lives in a child acceptance_criteria node (no inline AC)', () => {
      const parent = makeTask({ acceptanceCriteria: [] })
      const childAc = { id: 'ac-1', type: 'acceptance_criteria', parentId: parent.id, title: 'Given X, When Y, Then Z' }
      const report = analyzeSprintHealth(makeDoc([parent, childAc]))
      expect(report.metrics.tasksWithoutAC).toBe(0)
    })

    it('flags a task with no inline AC and no child AC node as tasksWithoutAC', () => {
      const doc = makeDoc([makeTask({ acceptanceCriteria: [] })])
      const report = analyzeSprintHealth(doc)
      expect(report.metrics.tasksWithoutAC).toBe(1)
    })
  })
})
