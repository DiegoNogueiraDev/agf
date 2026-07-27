/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Bug-audit regression — AUDIT-058 (MED).
 * src/core/planner/next-task.ts — the puller can enforce WIP=1: with `enforceWip`,
 * it refuses to surface a second task while one is already in_progress.
 */
import { describe, it, expect } from 'vitest'
import { findNextTask } from '../core/planner/next-task.js'
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

const ts = '2026-01-01T00:00:00Z'

describe('AUDIT-058 — WIP=1 enforcement at the puller (opt-in)', () => {
  it('enforceWip refuses to pull a second task while one is in_progress', () => {
    const doc = makeDoc([
      { id: 't1', type: 'task', title: 'Active', status: 'in_progress', priority: 1, createdAt: ts, updatedAt: ts },
      { id: 't2', type: 'task', title: 'Waiting', status: 'backlog', priority: 1, createdAt: ts, updatedAt: ts },
    ])
    expect(findNextTask(doc, { enforceWip: true })).toBeNull()
  })

  it('enforceWip allows a pull when nothing is in_progress', () => {
    const doc = makeDoc([
      { id: 't2', type: 'task', title: 'Waiting', status: 'backlog', priority: 1, createdAt: ts, updatedAt: ts },
    ])
    const r = findNextTask(doc, { enforceWip: true })
    expect(r?.node.id).toBe('t2')
  })

  it('without enforceWip, behaviour is unchanged (legacy callers unaffected)', () => {
    const doc = makeDoc([
      { id: 't1', type: 'task', title: 'Active', status: 'in_progress', priority: 1, createdAt: ts, updatedAt: ts },
      { id: 't2', type: 'task', title: 'Waiting', status: 'backlog', priority: 1, createdAt: ts, updatedAt: ts },
    ])
    expect(findNextTask(doc)?.node.id).toBe('t2')
  })
})
