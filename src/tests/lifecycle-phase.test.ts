import { describe, it, expect } from 'vitest'
import { detectCurrentPhase, ALL_ANALYZE_MODES } from '../core/planner/lifecycle-phase.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: Array<{ id: string; type: string; status: string; sprint?: string }> = []): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      status: n.status,
      title: `Node ${n.id}`,
      priority: 3,
      createdAt: '2026-06-23T00:00:00Z',
      updatedAt: '2026-06-23T00:00:00Z',
      acceptanceCriteria: [],
      blocked: false,
      sprint: n.sprint,
      metadata: {},
    })),
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  } as unknown as GraphDocument
}

describe('detectCurrentPhase', () => {
  it('returns ANALYZE for empty graph', () => {
    expect(detectCurrentPhase(makeDoc([]))).toBe('ANALYZE')
  })

  it('returns IMPLEMENT when any task is in_progress', () => {
    const doc = makeDoc([
      { id: 't1', type: 'task', status: 'in_progress' },
      { id: 't2', type: 'task', status: 'backlog' },
    ])
    expect(detectCurrentPhase(doc)).toBe('IMPLEMENT')
  })

  it('returns REVIEW when all tasks are done', () => {
    const doc = makeDoc([
      { id: 't1', type: 'task', status: 'done' },
      { id: 't2', type: 'task', status: 'done' },
    ])
    expect(detectCurrentPhase(doc)).toBe('REVIEW')
  })

  it('respects phaseOverride', () => {
    const doc = makeDoc([])
    expect(detectCurrentPhase(doc, { phaseOverride: 'DEPLOY' })).toBe('DEPLOY')
  })

  it('returns DESIGN when only design nodes exist', () => {
    const doc = makeDoc([{ id: 'd1', type: 'decision', status: 'backlog' }])
    expect(detectCurrentPhase(doc)).toBe('DESIGN')
  })

  it('returns PLAN when tasks have no sprint', () => {
    const doc = makeDoc([{ id: 't1', type: 'task', status: 'backlog' }])
    expect(detectCurrentPhase(doc)).toBe('PLAN')
  })

  it('returns VALIDATE when ≥50% tasks are done', () => {
    const doc = makeDoc([
      { id: 't1', type: 'task', status: 'done', sprint: '1' },
      { id: 't2', type: 'task', status: 'backlog', sprint: '1' },
    ])
    expect(detectCurrentPhase(doc)).toBe('VALIDATE')
  })
})

describe('ALL_ANALYZE_MODES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(ALL_ANALYZE_MODES)).toBe(true)
    expect(ALL_ANALYZE_MODES.length).toBeGreaterThan(0)
  })

  it('contains common modes', () => {
    expect(ALL_ANALYZE_MODES).toContain('scope')
    expect(ALL_ANALYZE_MODES).toContain('risk')
    expect(ALL_ANALYZE_MODES).toContain('blockers')
  })

  it('has no duplicates', () => {
    const unique = new Set(ALL_ANALYZE_MODES)
    expect(unique.size).toBe(ALL_ANALYZE_MODES.length)
  })
})
