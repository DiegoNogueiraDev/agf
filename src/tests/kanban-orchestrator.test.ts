import { describe, it, expect } from 'vitest'
import { generateSuggestions } from '../core/kanban/kanban-orchestrator.js'
import { buildKanbanBoard } from '../core/kanban/kanban-builder.js'
import { DEFAULT_KANBAN_CONFIG } from '../core/kanban/kanban-types.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: object[] = [], edges: object[] = []): GraphDocument {
  return {
    version: 1,
    project: 'test',
    nodes: nodes as GraphDocument['nodes'],
    edges: edges as GraphDocument['edges'],
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

describe('generateSuggestions', () => {
  it('returns an array of suggestions', () => {
    const doc = makeDoc([makeTask()])
    const board = buildKanbanBoard(doc, DEFAULT_KANBAN_CONFIG)
    const suggestions = generateSuggestions(doc, board)
    expect(Array.isArray(suggestions)).toBe(true)
  })

  it('returns empty array for empty board', () => {
    const doc = makeDoc()
    const board = buildKanbanBoard(doc, DEFAULT_KANBAN_CONFIG)
    const suggestions = generateSuggestions(doc, board)
    expect(suggestions).toHaveLength(0)
  })

  it('each suggestion includes nodeId, action, and reason', () => {
    const doc = makeDoc([makeTask(), makeTask({ status: 'in_progress' })])
    const board = buildKanbanBoard(doc, DEFAULT_KANBAN_CONFIG)
    const suggestions = generateSuggestions(doc, board)
    for (const s of suggestions) {
      expect(typeof s.nodeId).toBe('string')
      expect(typeof s.action).toBe('string')
      expect(typeof s.reason).toBe('string')
    }
  })
})
