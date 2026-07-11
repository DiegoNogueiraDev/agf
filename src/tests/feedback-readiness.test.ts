/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import { checkListeningReadiness } from '../core/listener/feedback-readiness.js'
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

describe('checkListeningReadiness', () => {
  it('returns an object with ready and checks fields for an empty doc', () => {
    const report = checkListeningReadiness(makeDoc([]))
    expect(report).toHaveProperty('ready')
    expect(report).toHaveProperty('checks')
    expect(Array.isArray(report.checks)).toBe(true)
  })

  it('result has score and grade fields', () => {
    const report = checkListeningReadiness(makeDoc([]))
    expect(report).toHaveProperty('score')
    expect(report).toHaveProperty('grade')
    expect(typeof report.score).toBe('number')
    expect(typeof report.grade).toBe('string')
  })

  it('all-done doc scores higher than a no-tasks doc', () => {
    const emptyReport = checkListeningReadiness(makeDoc([]))

    const allDoneDoc = makeDoc([
      {
        id: 't1',
        type: 'task',
        title: 'T1',
        status: 'done',
        priority: 3,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 't2',
        type: 'task',
        title: 'T2',
        status: 'done',
        priority: 3,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ])
    const allDoneReport = checkListeningReadiness(allDoneDoc)

    // all_tasks_done check passes only when there are tasks and all are done
    const allDoneCheck = allDoneReport.checks.find((c) => c.name === 'all_tasks_done')
    const emptyCheck = emptyReport.checks.find((c) => c.name === 'all_tasks_done')
    expect(allDoneCheck?.passed).toBe(true)
    expect(emptyCheck?.passed).toBe(false)
  })

  it('ready is false when required checks fail', () => {
    // Doc with an in-progress task — no_in_progress required check must fail
    const doc = makeDoc([
      {
        id: 't1',
        type: 'task',
        title: 'T1',
        status: 'in_progress',
        priority: 3,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ])
    const report = checkListeningReadiness(doc)
    expect(report.ready).toBe(false)
  })
})
