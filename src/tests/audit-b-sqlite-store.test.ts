/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Audit B — regression tests for the soft-delete / snapshot / edge-reader defects
 * in SqliteStore (AUDIT-008..014, 016, 017). Each test reproduces the pre-fix
 * behaviour and asserts the post-fix invariant.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { GraphEventBus } from '../core/events/event-bus.js'
import { registerHook, _resetRegisteredHooks } from '../core/hooks/register-hook.js'
import { deny } from '../core/hooks/hook-types.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  const ts = new Date().toISOString()
  return {
    id: `node_${Math.random().toString(36).slice(2, 10)}`,
    type: 'task',
    title: 'Test Node',
    status: 'backlog',
    priority: 3,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  }
}

function makeEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
  const ts = new Date().toISOString()
  return {
    id: `edge_${Math.random().toString(36).slice(2, 10)}`,
    from: '',
    to: '',
    relationType: 'depends_on',
    createdAt: ts,
    ...overrides,
  }
}

describe('Audit B — SqliteStore soft-delete / snapshot defects', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject()
  })

  afterEach(() => {
    store?.close()
  })

  // ── AUDIT-008 ─────────────────────────────────────────────
  it('AUDIT-008: restoreSnapshot preserves soft-deleted nodes absent from the snapshot', () => {
    const keep = makeNode({ title: 'Keep' })
    const archived = makeNode({ title: 'Archived' })
    store.insertNode(keep)
    store.insertNode(archived)
    store.deleteNode(archived.id) // soft-delete: excluded from the snapshot

    const snapId = store.createSnapshot()

    // mutate after the snapshot, then restore
    store.insertNode(makeNode({ title: 'Transient' }))
    store.restoreSnapshot(snapId)

    // The archived node must NOT have been hard-deleted by the restore.
    const raw = store.getDb().prepare('SELECT id, archived FROM nodes WHERE id = ?').get(archived.id) as
      { id: string; archived: number } | undefined
    expect(raw).toBeDefined()
    expect(store.restoreNode(archived.id)).toBe(true)
    expect(store.getNodeById(archived.id)?.title).toBe('Archived')
  })

  it('AUDIT-008: restoreSnapshot still revives a node archived after the snapshot', () => {
    const n = makeNode({ title: 'Original' })
    store.insertNode(n)
    const snapId = store.createSnapshot()
    store.deleteNode(n.id)
    const result = store.restoreSnapshot(snapId)
    expect(result.nodesValid).toBeGreaterThanOrEqual(1)
    expect(store.getNodeById(n.id)?.title).toBe('Original')
  })

  // ── AUDIT-009 ─────────────────────────────────────────────
  it('AUDIT-009: searchNodes excludes soft-deleted nodes (FTS trigger re-indexes on archive)', () => {
    const n = makeNode({ title: 'Unique searchable widget' })
    store.insertNode(n)
    expect(store.searchNodes('widget').length).toBeGreaterThanOrEqual(1)

    store.deleteNode(n.id)
    expect(store.searchNodes('widget')).toHaveLength(0)
  })

  // ── AUDIT-010 ─────────────────────────────────────────────
  it('AUDIT-010: edge readers exclude edges whose endpoint is archived', () => {
    const a = makeNode()
    const b = makeNode()
    store.insertNode(a)
    store.insertNode(b)
    store.insertEdge(makeEdge({ from: a.id, to: b.id }))
    expect(store.getEdgesFrom(a.id)).toHaveLength(1)

    store.deleteNode(b.id) // archive the `to` endpoint
    expect(store.getEdgesFrom(a.id)).toHaveLength(0)
    expect(store.getEdgesTo(b.id)).toHaveLength(0)
    expect(store.getAllEdges()).toHaveLength(0)
  })

  // ── AUDIT-011 ─────────────────────────────────────────────
  it('AUDIT-011: insertEdge rejects an edge anchored on an archived endpoint', () => {
    const a = makeNode()
    const b = makeNode()
    store.insertNode(a)
    store.insertNode(b)
    store.deleteNode(b.id)

    store.insertEdge(makeEdge({ from: a.id, to: b.id }))

    // Inspect the raw table (getEdgesFrom would hide it via AUDIT-010 anyway).
    const cnt = store.getDb().prepare('SELECT COUNT(*) AS c FROM edges').get() as { c: number }
    expect(cnt.c).toBe(0)
  })

  it('AUDIT-011: bulkInsert and mergeInsert skip edges to archived endpoints', () => {
    const a = makeNode()
    const b = makeNode()
    store.insertNode(a)
    store.insertNode(b)
    store.deleteNode(b.id)

    store.bulkInsert([], [makeEdge({ from: a.id, to: b.id })])
    expect((store.getDb().prepare('SELECT COUNT(*) AS c FROM edges').get() as { c: number }).c).toBe(0)

    store.mergeInsert([], [makeEdge({ id: 'edge_merge_archived', from: a.id, to: b.id })])
    expect((store.getDb().prepare('SELECT COUNT(*) AS c FROM edges').get() as { c: number }).c).toBe(0)
  })

  // ── AUDIT-012 ─────────────────────────────────────────────
  it('AUDIT-012: restoreNode restores the whole archived subtree (cascade)', () => {
    const parent = makeNode()
    const child = makeNode()
    store.insertNode(parent)
    store.insertNode(child)
    store.updateNode(child.id, { parentId: parent.id })

    store.deleteNode(parent.id) // cascade-archives parent + child
    expect(store.getNodeById(parent.id)).toBeNull()
    expect(store.getNodeById(child.id)).toBeNull()

    expect(store.restoreNode(parent.id)).toBe(true)
    expect(store.getNodeById(parent.id)).not.toBeNull()
    expect(store.getNodeById(child.id)).not.toBeNull()
  })

  it('AUDIT-012: restoreNode does not revive a child archived in a separate cascade', () => {
    const parent = makeNode()
    const child = makeNode()
    store.insertNode(parent)
    store.insertNode(child)
    store.updateNode(child.id, { parentId: parent.id })

    store.deleteNode(child.id, 1000) // child archived alone at T=1000
    store.deleteNode(parent.id, 2000) // parent archived at T=2000 (child already gone)

    store.restoreNode(parent.id)
    expect(store.getNodeById(parent.id)).not.toBeNull()
    expect(store.getNodeById(child.id)).toBeNull() // stays archived
  })

  // ── AUDIT-013 ─────────────────────────────────────────────
  it('AUDIT-013: bulkInsert preserves test_files / evolution_reason / evolution_count', () => {
    const n = makeNode({ testFiles: ['a.test.ts'], evolutionReason: 'because', evolutionCount: 3 })
    store.bulkInsert([n], [])
    const got = store.getNodeById(n.id)
    expect(got?.testFiles).toEqual(['a.test.ts'])
    expect(got?.evolutionReason).toBe('because')
    expect(got?.evolutionCount).toBe(3)
  })

  it('AUDIT-013: mergeInsert preserves test_files / evolution_reason / evolution_count', () => {
    const n = makeNode({ testFiles: ['b.test.ts'], evolutionReason: 'merge-reason', evolutionCount: 2 })
    store.mergeInsert([n], [])
    const got = store.getNodeById(n.id)
    expect(got?.testFiles).toEqual(['b.test.ts'])
    expect(got?.evolutionReason).toBe('merge-reason')
    expect(got?.evolutionCount).toBe(2)
  })

  // ── AUDIT-014 ─────────────────────────────────────────────
  it('AUDIT-014: bulkUpdateStatus does not emit node:updated for changes a rollback reverts', () => {
    const prevHooks = process.env.AGF_HOOKS
    const prevDisabled = process.env.MCP_GRAPH_HOOKS_DISABLED
    delete process.env.AGF_HOOKS
    delete process.env.MCP_GRAPH_HOOKS_DISABLED
    _resetRegisteredHooks()

    const n1 = makeNode({ status: 'backlog' })
    const n2 = makeNode({ status: 'backlog' })
    store.insertNode(n1)
    store.insertNode(n2)

    const bus = new GraphEventBus()
    const updates: string[] = []
    bus.on('node:updated', (e) => updates.push(String((e.payload as { nodeId: string }).nodeId)))
    store.eventBus = bus

    const unregister = registerHook('status:pre-change', (event) => {
      const nodeId = (event.payload as { nodeId?: string }).nodeId
      return nodeId === n2.id ? deny('blocked in test') : undefined
    })

    try {
      expect(() => store.bulkUpdateStatus([n1.id, n2.id], 'in_progress')).toThrow()
      // The transaction rolled back, so n1 is still backlog and no event should have fired.
      expect(store.getNodeById(n1.id)?.status).toBe('backlog')
      expect(updates).toHaveLength(0)
    } finally {
      unregister()
      _resetRegisteredHooks()
      if (prevHooks !== undefined) process.env.AGF_HOOKS = prevHooks
      if (prevDisabled !== undefined) process.env.MCP_GRAPH_HOOKS_DISABLED = prevDisabled
    }
  })

  it('AUDIT-014: bulkUpdateStatus still emits once per committed node on success', () => {
    const n1 = makeNode({ status: 'backlog' })
    const n2 = makeNode({ status: 'backlog' })
    store.insertNode(n1)
    store.insertNode(n2)

    const bus = new GraphEventBus()
    const updates: string[] = []
    bus.on('node:updated', (e) => updates.push(String((e.payload as { nodeId: string }).nodeId)))
    store.eventBus = bus

    const result = store.bulkUpdateStatus([n1.id, n2.id], 'in_progress')
    expect(result.updated).toHaveLength(2)
    expect(updates.sort()).toEqual([n1.id, n2.id].sort())
  })

  // ── AUDIT-016 ─────────────────────────────────────────────
  it('AUDIT-016: searchNodes never throws on a malformed FTS5 query', () => {
    store.insertNode(makeNode({ title: 'quote handling test' }))
    expect(() => store.searchNodes('foo"')).not.toThrow()
    expect(() => store.searchNodes('"unbalanced')).not.toThrow()
    expect(() => store.searchNodes('a AND')).not.toThrow()
    expect(Array.isArray(store.searchNodes('foo"'))).toBe(true)
  })

  // ── AUDIT-017 ─────────────────────────────────────────────
  it('AUDIT-017: restoreNode emits a node event so caches refresh', () => {
    const n = makeNode()
    store.insertNode(n)
    store.deleteNode(n.id)

    const bus = new GraphEventBus()
    const events: string[] = []
    bus.on('node:updated', (e) => events.push(String((e.payload as { nodeId: string }).nodeId)))
    store.eventBus = bus

    expect(store.restoreNode(n.id)).toBe(true)
    expect(events).toContain(n.id)
  })
})
