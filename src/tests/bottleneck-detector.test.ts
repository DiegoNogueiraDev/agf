import { describe, it, expect } from 'vitest'
import { detectBottlenecks } from '../core/insights/bottleneck-detector.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(
  nodes: Array<{ id: string; type: string; status: string; title?: string; blocked?: boolean }>,
  edges: Array<{ from: string; to: string; relationType: string }> = [],
): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      status: n.status,
      title: n.title ?? `Task ${n.id}`,
      priority: 3,
      createdAt: '2026-06-23T00:00:00Z',
      updatedAt: '2026-06-23T00:00:00Z',
      acceptanceCriteria: [],
      blocked: n.blocked ?? false,
      metadata: {},
    })),
    edges: edges.map((e, i) => ({
      id: `edge-${i}`,
      from: e.from,
      to: e.to,
      relationType: e.relationType,
    })),
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  } as unknown as GraphDocument
}

describe('detectBottlenecks', () => {
  it('returns a report object', () => {
    const result = detectBottlenecks(makeDoc([]))
    expect(typeof result).toBe('object')
    expect(result).not.toBeNull()
  })

  it('returns empty arrays for empty doc', () => {
    const result = detectBottlenecks(makeDoc([]))
    expect(result.blockedTasks).toHaveLength(0)
    expect(result.missingAcceptanceCriteria).toHaveLength(0)
  })

  it('handles null doc gracefully', () => {
    const result = detectBottlenecks(null as never)
    expect(result.blockedTasks).toHaveLength(0)
  })

  it('detects blocked tasks', () => {
    const doc = makeDoc([{ id: 't1', type: 'task', status: 'in_progress', blocked: true }])
    const result = detectBottlenecks(doc)
    expect(result.blockedTasks.length).toBeGreaterThan(0)
  })

  it('does not flag done tasks as blocked', () => {
    const doc = makeDoc([{ id: 't1', type: 'task', status: 'done', blocked: true }])
    const result = detectBottlenecks(doc)
    expect(result.blockedTasks).toHaveLength(0)
  })

  it('detects depends_on edge to undone task as blocked', () => {
    const doc = makeDoc(
      [
        { id: 'blocker', type: 'task', status: 'backlog' },
        { id: 'blocked', type: 'task', status: 'in_progress' },
      ],
      [{ from: 'blocked', to: 'blocker', relationType: 'depends_on' }],
    )
    const result = detectBottlenecks(doc)
    const found = result.blockedTasks.find((t) => t.id === 'blocked')
    expect(found).toBeDefined()
  })

  it('has criticalPath field', () => {
    const result = detectBottlenecks(makeDoc([]))
    expect('criticalPath' in result).toBe(true)
  })

  it('has oversizedTasks array', () => {
    const result = detectBottlenecks(makeDoc([]))
    expect(Array.isArray(result.oversizedTasks)).toBe(true)
  })
})
