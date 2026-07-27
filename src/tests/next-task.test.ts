/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { findNextTask, findUnblockedTasks } from '../core/planner/next-task.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

function makeDoc(nodes: object[], edges: object[] = []): GraphDocument {
  return {
    version: '1',
    project: { id: 'p1', name: 'test', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    nodes,
    edges,
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  } as unknown as GraphDocument
}

describe('findNextTask', () => {
  it('returns null for a doc with no nodes', () => {
    const result = findNextTask(makeDoc([]))
    expect(result).toBeNull()
  })

  it('returns the single backlog task', () => {
    const doc = makeDoc([
      {
        id: 't1',
        type: 'task',
        title: 'Do work',
        status: 'backlog',
        priority: 3,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ])
    const result = findNextTask(doc)
    expect(result).not.toBeNull()
    expect(result!.node.id).toBe('t1')
  })

  it('does not return a done task', () => {
    const doc = makeDoc([
      {
        id: 't1',
        type: 'task',
        title: 'Already done',
        status: 'done',
        priority: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ])
    expect(findNextTask(doc)).toBeNull()
  })

  it('does not return a blocked task', () => {
    const doc = makeDoc([
      {
        id: 't1',
        type: 'task',
        title: 'Blocked task',
        status: 'backlog',
        priority: 1,
        blocked: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ])
    expect(findNextTask(doc)).toBeNull()
  })
})

describe('findUnblockedTasks', () => {
  it('returns only non-blocked backlog tasks', () => {
    const doc = makeDoc([
      {
        id: 't1',
        type: 'task',
        title: 'Open',
        status: 'backlog',
        priority: 3,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 't2',
        type: 'task',
        title: 'Blocked',
        status: 'backlog',
        priority: 2,
        blocked: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 't3',
        type: 'task',
        title: 'Done',
        status: 'done',
        priority: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ])
    const results = findUnblockedTasks(doc)
    expect(results.map((n) => n.id)).toContain('t1')
    expect(results.map((n) => n.id)).not.toContain('t2')
    expect(results.map((n) => n.id)).not.toContain('t3')
  })
})
