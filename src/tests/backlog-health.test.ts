import { describe, it, expect } from 'vitest'
import { analyzeBacklogHealth } from '../core/listener/backlog-health.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: Array<{ type: string; status: string; title?: string; createdAt?: string }>): GraphDocument {
  return {
    version: '1.0',
    project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
    nodes: nodes.map((n, i) => ({
      id: `node-${i}`,
      type: n.type,
      status: n.status,
      title: n.title ?? `Task ${i}`,
      priority: 3,
      createdAt: n.createdAt ?? '2026-06-23T00:00:00Z',
      updatedAt: '2026-06-23T00:00:00Z',
      acceptanceCriteria: [],
      metadata: {},
    })),
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  } as unknown as GraphDocument
}

describe('analyzeBacklogHealth', () => {
  it('returns an object', () => {
    const result = analyzeBacklogHealth(makeDoc([]))
    expect(typeof result).toBe('object')
    expect(result).not.toBeNull()
  })

  it('reports 0 backlog tasks for empty doc', () => {
    const result = analyzeBacklogHealth(makeDoc([]))
    expect(result.backlogCount).toBe(0)
  })

  it('counts backlog tasks', () => {
    const doc = makeDoc([
      { type: 'task', status: 'backlog' },
      { type: 'task', status: 'backlog' },
      { type: 'task', status: 'done' },
    ])
    const result = analyzeBacklogHealth(doc)
    expect(result.backlogCount).toBe(2)
  })

  it('staleTasks is an array', () => {
    const result = analyzeBacklogHealth(makeDoc([{ type: 'task', status: 'backlog' }]))
    expect(Array.isArray(result.staleTasks)).toBe(true)
  })

  it('detects stale tasks (created 31+ days ago)', () => {
    const old = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString()
    const doc = makeDoc([{ type: 'task', status: 'backlog', createdAt: old }])
    const result = analyzeBacklogHealth(doc)
    expect(result.staleTasks.length).toBeGreaterThan(0)
  })
})
