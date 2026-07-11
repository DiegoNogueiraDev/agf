/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Bug fix — node_4584fc7539ce: restoreSnapshot inserted EVERY snapshot edge, even
 * when an endpoint node failed validation / was absent, leaving dangling edges in
 * the restored graph. The fix skips edges whose endpoints are not re-inserted.
 */
import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'

const ts = '2026-01-01T00:00:00Z'
function node(id: string): GraphNode {
  return {
    id,
    type: 'task',
    title: id,
    status: 'backlog' as never,
    priority: 1,
    acceptanceCriteria: [],
    tags: [],
    createdAt: ts,
    updatedAt: ts,
  }
}

function craftSnapshot(store: SqliteStore, pid: string, data: object): number {
  const res = store
    .getDb()
    .prepare('INSERT INTO snapshots (project_id, data, created_at) VALUES (?, ?, ?)')
    .run(pid, JSON.stringify(data), ts)
  return Number(res.lastInsertRowid)
}

describe('node_4584fc7539ce — restoreSnapshot drops dangling edges', () => {
  it('does NOT restore an edge whose endpoint node is absent from the snapshot', () => {
    const store = SqliteStore.open(':memory:')
    store.initProject('dangling-test')
    store.insertNode(node('A'))
    const pid = store.getProject()!.id

    const snapId = craftSnapshot(store, pid, {
      nodes: [node('A')], // only A — 'ghost' deliberately absent
      edges: [{ id: 'e-ghost', from: 'A', to: 'ghost', relationType: 'depends_on', createdAt: ts }],
    })

    const out = store.restoreSnapshot(snapId)
    expect(out.edgesRestored).toBe(0) // dangling edge skipped
    expect(store.getNodeById('A')).not.toBeNull()
    expect(store.getAllEdges()).toHaveLength(0) // no dangling edge survives
    store.close()
  })

  it('regression: restores an edge whose endpoints both exist', () => {
    const store = SqliteStore.open(':memory:')
    store.initProject('dangling-test-2')
    store.insertNode(node('A'))
    const pid = store.getProject()!.id

    const snapId = craftSnapshot(store, pid, {
      nodes: [node('A'), node('B')],
      edges: [{ id: 'e-ab', from: 'A', to: 'B', relationType: 'depends_on', createdAt: ts }],
    })

    const out = store.restoreSnapshot(snapId)
    expect(out.edgesRestored).toBe(1)
    expect(store.getAllEdges()).toHaveLength(1)
    store.close()
  })
})
