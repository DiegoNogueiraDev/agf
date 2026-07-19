import { describe, it, expect } from 'vitest'
import { StaleTaskSchema, BacklogHealthReportSchema, TechDebtIndicatorSchema } from '../schemas/listener-schema.js'

describe('StaleTaskSchema', () => {
  it('accepts a valid stale task', () => {
    expect(
      StaleTaskSchema.safeParse({
        nodeId: 'node_abc',
        title: 'Refactor auth module',
        daysInBacklog: 14,
      }).success,
    ).toBe(true)
  })

  it('rejects negative daysInBacklog', () => {
    expect(
      StaleTaskSchema.safeParse({
        nodeId: 'n',
        title: 't',
        daysInBacklog: -1,
      }).success,
    ).toBe(false)
  })
})

describe('TechDebtIndicatorSchema', () => {
  it('accepts a valid tech debt indicator', () => {
    expect(
      TechDebtIndicatorSchema.safeParse({
        nodeId: 'node_debt',
        title: 'TODO: refactor legacy parser',
        keywords: ['legacy', 'refactor', 'TODO'],
      }).success,
    ).toBe(true)
  })
})

describe('BacklogHealthReportSchema', () => {
  it('accepts a healthy backlog report', () => {
    expect(
      BacklogHealthReportSchema.safeParse({
        backlogCount: 5,
        readyCount: 3,
        staleTasks: [],
        techDebtIndicators: [],
        cleanForNewCycle: true,
        typeDistribution: { task: 4, epic: 1 },
        priorityDistribution: { 1: 1, 2: 2, 3: 2 },
        aging: { avgDays: 3, maxDays: 7 },
      }).success,
    ).toBe(true)
  })
})
