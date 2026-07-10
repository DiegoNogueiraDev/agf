import { describe, it, expect } from 'vitest'
import { repairCycles } from '../core/planner/cycle-repair.js'
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

function makeTask(id: string) {
  return { id, type: 'task', title: id, status: 'ready' }
}

function makeEdge(id: string, from: string, to: string, type = 'depends_on') {
  return { id, from, to, relationType: type, createdAt: Date.now() }
}

describe('repairCycles', () => {
  it('returns none_needed for acyclic graph', () => {
    const doc = makeDoc([makeTask('a'), makeTask('b')], [makeEdge('e1', 'a', 'b')])
    const result = repairCycles(doc)
    expect(result.action).toBe('none_needed')
    expect(result.cycles).toHaveLength(0)
  })

  it('returns none_needed for empty graph', () => {
    const result = repairCycles(makeDoc())
    expect(result.action).toBe('none_needed')
  })

  it('detects a 2-node cycle', () => {
    const doc = makeDoc([makeTask('a'), makeTask('b')], [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'a')])
    const result = repairCycles(doc)
    expect(result.cycles.length).toBeGreaterThan(0)
    expect(['auto_applied', 'proposals', 'mixed']).toContain(result.action)
  })

  it('result includes proposals or autoApplied array', () => {
    const doc = makeDoc([makeTask('a'), makeTask('b')], [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'a')])
    const result = repairCycles(doc)
    expect(Array.isArray(result.proposals)).toBe(true)
    expect(Array.isArray(result.autoApplied)).toBe(true)
  })
})
