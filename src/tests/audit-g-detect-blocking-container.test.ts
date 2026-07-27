/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Bug-audit regression — AUDIT-063 (LOW).
 * src/core/gaps/detect-blocking-container.ts — a fresh epic with backlog children
 * must not raise a `required` gap that gates readiness and advises `done --force`.
 */
import { describe, it, expect } from 'vitest'
import { detectBlockingContainer } from '../core/gaps/detect-blocking-container.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

const ts = '2026-01-01T00:00:00Z'

function makeDoc(nodes: object[], edges: object[] = []): GraphDocument {
  return {
    version: '1',
    project: { id: 'p1', name: 'test', createdAt: ts, updatedAt: ts },
    nodes,
    edges,
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  } as unknown as GraphDocument
}

describe('AUDIT-063 — container-epic gap is not a readiness-gating `required`', () => {
  it('a fresh epic with backlog children is flagged at most as `recommended`', () => {
    const doc = makeDoc([
      { id: 'e1', type: 'epic', title: 'Epic', status: 'backlog', priority: 2, createdAt: ts, updatedAt: ts },
      {
        id: 't1',
        type: 'task',
        title: 'Child 1',
        status: 'backlog',
        priority: 3,
        parentId: 'e1',
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: 't2',
        type: 'task',
        title: 'Child 2',
        status: 'backlog',
        priority: 3,
        parentId: 'e1',
        createdAt: ts,
        updatedAt: ts,
      },
    ])
    const gaps = detectBlockingContainer(doc)
    expect(gaps.length).toBeGreaterThan(0)
    for (const g of gaps) {
      expect(g.severity).not.toBe('required')
      expect(g.severity).toBe('recommended')
    }
  })

  it('an epic with its own AC is not flagged at all', () => {
    const doc = makeDoc([
      {
        id: 'e1',
        type: 'epic',
        title: 'Epic',
        status: 'backlog',
        priority: 2,
        acceptanceCriteria: ['has real work'],
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: 't1',
        type: 'task',
        title: 'Child',
        status: 'backlog',
        priority: 3,
        parentId: 'e1',
        createdAt: ts,
        updatedAt: ts,
      },
    ])
    expect(detectBlockingContainer(doc)).toHaveLength(0)
  })
})
