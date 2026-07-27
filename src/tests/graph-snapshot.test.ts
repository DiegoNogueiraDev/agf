/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode, GraphEdge } from '../schemas/entity.schema.js'
import { buildGraphSnapshot } from '../core/web/graph-snapshot.js'

function freshStore(): SqliteStore {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('proj-graph-snap')
  return store
}

function node(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  const ts = new Date().toISOString()
  return {
    id,
    type: 'task',
    title: `node ${id}`,
    status: 'backlog',
    priority: 3,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  }
}

describe('buildGraphSnapshot', () => {
  let store: SqliteStore
  beforeEach(() => {
    store = freshStore()
  })

  it('returns light node fields + scoped edges and respects limit/truncated', () => {
    store.insertNode(node('node_a'))
    store.insertNode(node('node_b'))
    store.insertNode(node('node_c'))
    const edge: GraphEdge = {
      id: 'edge_ab',
      from: 'node_a',
      to: 'node_b',
      relationType: 'depends_on',
      createdAt: new Date().toISOString(),
    }
    store.insertEdge(edge)

    const snap = buildGraphSnapshot(store, { limit: 2 })

    expect(snap.nodes).toHaveLength(2)
    expect(snap.total).toBe(3)
    expect(snap.truncated).toBe(true)
    // only the 6 light fields, no description/metadata leak
    expect(Object.keys(snap.nodes[0]).sort()).toEqual(['id', 'parentId', 'priority', 'status', 'title', 'type'])
  })

  it('excludes done nodes by default', () => {
    store.insertNode(node('node_live', { status: 'in_progress' }))
    store.insertNode(node('node_done', { status: 'done' }))

    const snap = buildGraphSnapshot(store)
    const ids = snap.nodes.map((n) => n.id)

    expect(ids).toContain('node_live')
    expect(ids).not.toContain('node_done')
  })

  it('filters by status allow-list', () => {
    store.insertNode(node('node_p', { status: 'in_progress' }))
    store.insertNode(node('node_q', { status: 'backlog' }))

    const snap = buildGraphSnapshot(store, { status: ['in_progress'] })

    expect(snap.nodes.map((n) => n.id)).toEqual(['node_p'])
  })
})
