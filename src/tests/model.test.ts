import { describe, it, expect } from 'vitest'
import { buildDashboardModel, type DashboardInput } from '../tui/model.js'

function makeInput(overrides: Partial<DashboardInput> = {}): DashboardInput {
  return {
    projectName: 'test-project',
    modelLabel: 'claude-sonnet',
    tasks: [],
    tokens: { input: 0, output: 0, cache: 0, costUsd: 0 },
    stats: {
      totalNodes: 0,
      byStatus: {},
      byType: {},
    },
    ...overrides,
  }
}

describe('buildDashboardModel', () => {
  it('sets projectName and modelLabel from input', () => {
    const model = buildDashboardModel(makeInput())
    expect(model.projectName).toBe('test-project')
    expect(model.modelLabel).toBe('claude-sonnet')
  })

  it('returns phase "—" when totalNodes is 0', () => {
    const model = buildDashboardModel(makeInput({ stats: { totalNodes: 0, byStatus: {}, byType: {} } }))
    expect(model.phase).toBe('—')
  })

  it('returns wip from in_progress count', () => {
    const model = buildDashboardModel(
      makeInput({ stats: { totalNodes: 5, byStatus: { in_progress: 2, done: 3 }, byType: {} } }),
    )
    expect(model.wip).toBe(2)
  })

  it('returns wip 0 when no in_progress tasks', () => {
    const model = buildDashboardModel(makeInput({ stats: { totalNodes: 3, byStatus: { done: 3 }, byType: {} } }))
    expect(model.wip).toBe(0)
  })

  it('sets totalTasks from totalNodes', () => {
    const model = buildDashboardModel(makeInput({ stats: { totalNodes: 10, byStatus: {}, byType: {} } }))
    expect(model.totalTasks).toBe(10)
  })

  it('passes through tasks array', () => {
    const tasks = [{ id: 't1', title: 'Task 1', status: 'done' as const, type: 'task', priority: 1 }]
    const model = buildDashboardModel(makeInput({ tasks }))
    expect(model.tasks).toBe(tasks)
  })

  it('passes through tokens object', () => {
    const tokens = { input: 100, output: 50, cache: 10, costUsd: 0.002 }
    const model = buildDashboardModel(makeInput({ tokens }))
    expect(model.tokens).toEqual(tokens)
  })
})
