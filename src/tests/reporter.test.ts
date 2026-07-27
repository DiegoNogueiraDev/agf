/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/sandbox/reporter.ts — updateGraphFromReport.
 * Uses a minimal fake store (only getNodeById + updateNodeStatus are exercised).
 */

import { describe, it, expect } from 'vitest'
import { updateGraphFromReport } from '../core/sandbox/reporter.js'
import { NodeNotFoundError } from '../core/utils/errors.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'

function fakeStore(status: string | null): { store: SqliteStore; writes: Array<{ id: string; status: string }> } {
  const writes: Array<{ id: string; status: string }> = []
  const store = {
    getNodeById: (id: string) => (status === null ? null : { id, status }),
    updateNodeStatus: (id: string, s: string) => writes.push({ id, status: s }),
  } as unknown as SqliteStore
  return { store, writes }
}

describe('updateGraphFromReport', () => {
  it('throws NodeNotFoundError for an unknown node', () => {
    const { store } = fakeStore(null)
    expect(() => updateGraphFromReport(store, 'missing', { success: true })).toThrow(NodeNotFoundError)
  })

  it('blocks a backlog task on failure', () => {
    const { store, writes } = fakeStore('backlog')
    const r = updateGraphFromReport(store, 'n1', { success: false })
    expect(r.newStatus).toBe('blocked')
    expect(writes).toEqual([{ id: 'n1', status: 'blocked' }])
  })

  it('unblocks a blocked task on success', () => {
    const { store, writes } = fakeStore('blocked')
    const r = updateGraphFromReport(store, 'n1', { success: true })
    expect(r.newStatus).toBe('in_progress')
    expect(writes).toEqual([{ id: 'n1', status: 'in_progress' }])
  })

  it('never overwrites a done task', () => {
    const { store, writes } = fakeStore('done')
    const r = updateGraphFromReport(store, 'n1', { success: false })
    expect(r.newStatus).toBeNull()
    expect(r.skipped).toContain('done')
    expect(writes).toEqual([])
  })

  it('does not churn an already-blocked task on repeated failure', () => {
    const { store, writes } = fakeStore('blocked')
    const r = updateGraphFromReport(store, 'n1', { success: false })
    expect(r.newStatus).toBeNull()
    expect(writes).toEqual([])
  })

  it('leaves a backlog task unchanged on success (finish_task owns done)', () => {
    const { store, writes } = fakeStore('backlog')
    const r = updateGraphFromReport(store, 'n1', { success: true })
    expect(r.newStatus).toBeNull()
    expect(writes).toEqual([])
  })
})
