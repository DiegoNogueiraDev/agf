import { describe, it, expect } from 'vitest'
import type {
  KanbanCard,
  KanbanColumn,
  WipViolation,
  KanbanMetrics,
  KanbanSwimlane,
} from '../core/kanban/kanban-types.js'

describe('kanban-types interfaces', () => {
  it('KanbanCard has required fields', () => {
    const card: KanbanCard = {
      id: 'n-001',
      title: 'Implement login',
      type: 'task',
      priority: 2,
    }
    expect(card.id).toBe('n-001')
    expect(card.type).toBe('task')
  })

  it('KanbanColumn has name, status, and cards array', () => {
    const col: KanbanColumn = {
      name: 'In Progress',
      status: 'in_progress',
      cards: [],
      wipLimit: 3,
    }
    expect(col.status).toBe('in_progress')
    expect(col.cards).toHaveLength(0)
  })

  it('WipViolation has column and count', () => {
    const violation: WipViolation = {
      column: 'In Progress',
      status: 'in_progress',
      count: 5,
      limit: 3,
    }
    expect(violation.count).toBe(5)
    expect(violation.limit).toBe(3)
  })

  it('KanbanMetrics has throughput and cycle time fields', () => {
    const metrics: KanbanMetrics = {
      throughput: 3,
      avgCycleTime: 2.5,
      wipViolations: [],
      blockedCount: 1,
    }
    expect(metrics.throughput).toBe(3)
    expect(metrics.wipViolations).toHaveLength(0)
  })

  it('KanbanSwimlane groups columns by criteria', () => {
    const swimlane: KanbanSwimlane = {
      label: 'Sprint 1',
      columns: [],
    }
    expect(swimlane.label).toBe('Sprint 1')
    expect(swimlane.columns).toHaveLength(0)
  })
})
