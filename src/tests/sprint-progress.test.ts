import { describe, it, expect } from 'vitest'
import { calculateSprintProgress } from '../core/implementer/sprint-progress.js'
import type { GraphDocument, GraphNode } from '../core/graph/graph-types.js'

const NOW = new Date().toISOString()

function makeDoc(nodes: GraphNode[] = []): GraphDocument {
  return {
    version: '1',
    project: { id: 'p1', name: 'test', createdAt: NOW, updatedAt: NOW },
    nodes,
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  }
}

function makeTask(id: string, status: GraphNode['status']): GraphNode {
  return {
    id,
    type: 'task',
    title: `Task ${id}`,
    status,
    priority: 3,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

describe('calculateSprintProgress', () => {
  it('returns 0% done for empty graph', () => {
    const report = calculateSprintProgress(makeDoc())
    expect(report.burndown.total).toBe(0)
    expect(report.burndown.done).toBe(0)
    expect(report.burndown.donePercent).toBe(0)
  })

  it('counts all status buckets', () => {
    const doc = makeDoc([
      makeTask('t1', 'done'),
      makeTask('t2', 'in_progress'),
      makeTask('t3', 'blocked'),
      makeTask('t4', 'backlog'),
      makeTask('t5', 'ready'),
    ])
    const report = calculateSprintProgress(doc)
    expect(report.burndown.total).toBe(5)
    expect(report.burndown.done).toBe(1)
    expect(report.burndown.inProgress).toBe(1)
    expect(report.burndown.blocked).toBe(1)
    expect(report.burndown.backlog).toBe(1)
    expect(report.burndown.ready).toBe(1)
  })

  it('calculates donePercent correctly', () => {
    const doc = makeDoc([
      makeTask('t1', 'done'),
      makeTask('t2', 'done'),
      makeTask('t3', 'backlog'),
      makeTask('t4', 'backlog'),
    ])
    const report = calculateSprintProgress(doc)
    expect(report.burndown.donePercent).toBe(50)
  })

  it('returns 100% when all tasks done', () => {
    const doc = makeDoc([makeTask('t1', 'done'), makeTask('t2', 'done')])
    const report = calculateSprintProgress(doc)
    expect(report.burndown.donePercent).toBe(100)
  })

  it('includes a summary string', () => {
    const doc = makeDoc([makeTask('t1', 'done'), makeTask('t2', 'backlog')])
    const report = calculateSprintProgress(doc)
    expect(typeof report.summary).toBe('string')
    expect(report.summary.length).toBeGreaterThan(0)
  })

  it('sprint field is null when no sprint arg provided', () => {
    const report = calculateSprintProgress(makeDoc())
    expect(report.sprint).toBeNull()
  })

  it('filters tasks by sprint when provided', () => {
    const t1: GraphNode = { ...makeTask('t1', 'done'), sprint: 'sprint-1' }
    const t2: GraphNode = { ...makeTask('t2', 'backlog'), sprint: 'sprint-2' }
    const doc = makeDoc([t1, t2])
    const report = calculateSprintProgress(doc, 'sprint-1')
    expect(report.burndown.total).toBe(1)
    expect(report.sprint).toBe('sprint-1')
  })

  it('has velocityTrend with required fields', () => {
    const report = calculateSprintProgress(makeDoc())
    expect(typeof report.velocityTrend.trend).toBe('string')
    expect(typeof report.velocityTrend.currentSprintVelocity).toBe('number')
    expect(typeof report.velocityTrend.averageVelocity).toBe('number')
  })
})
