import { describe, it, expect } from 'vitest'
import { buildKanbanBoard } from '../core/kanban/kanban-builder.js'
import { DEFAULT_KANBAN_CONFIG } from '../core/kanban/kanban-types.js'
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

describe('buildKanbanBoard', () => {
  it('returns a board with columns', () => {
    const board = buildKanbanBoard(makeDoc(), DEFAULT_KANBAN_CONFIG)
    expect(Array.isArray(board.columns)).toBe(true)
    expect(board.columns.length).toBeGreaterThan(0)
  })

  it('places tasks in their status column', () => {
    const doc = makeDoc([makeTask({ status: 'ready' }), makeTask({ status: 'done' })])
    const board = buildKanbanBoard(doc, DEFAULT_KANBAN_CONFIG)
    const readyCol = board.columns.find((c) => c.status === 'ready')
    const doneCol = board.columns.find((c) => c.status === 'done')
    expect(readyCol?.cards).toHaveLength(1)
    expect(doneCol?.cards).toHaveLength(1)
  })

  it('includes flow metrics', () => {
    const board = buildKanbanBoard(makeDoc(), DEFAULT_KANBAN_CONFIG)
    expect(board.metrics).toBeDefined()
    expect(typeof board.metrics.throughput).toBe('number')
  })

  it('returns swimlanes array', () => {
    const board = buildKanbanBoard(makeDoc(), DEFAULT_KANBAN_CONFIG)
    expect(Array.isArray(board.swimlanes)).toBe(true)
  })

  it('excludes non-task nodes when showOnlyTasks=true', () => {
    const doc = makeDoc([makeTask({ status: 'ready' }), { id: 'e1', type: 'epic', title: 'Epic', status: 'ready' }])
    const board = buildKanbanBoard(doc, { ...DEFAULT_KANBAN_CONFIG, showOnlyTasks: true })
    const totalCards = board.columns.reduce((sum, c) => sum + c.cards.length, 0)
    expect(totalCards).toBe(1)
  })
})
