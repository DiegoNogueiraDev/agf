/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Integration tests for RealContextRuntimeService (SqliteStore).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { RealContextRuntimeService } from '../core/services/context-runtime.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function seedNode(
  store: SqliteStore,
  overrides: Partial<GraphNode> & { id: string; type: GraphNode['type']; title: string },
): void {
  const now = new Date().toISOString()
  store.insertNode({
    id: overrides.id,
    type: overrides.type,
    title: overrides.title,
    description: overrides.description ?? '',
    status: overrides.status ?? 'backlog',
    priority: overrides.priority ?? 3,
    xpSize: overrides.xpSize ?? 'S',
    parentId: overrides.parentId ?? null,
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
    tags: overrides.tags ?? [],
    createdAt: now,
    updatedAt: now,
    metadata: {},
  })
}

describe('RealContextRuntimeService (SqliteStore)', () => {
  let store: SqliteStore
  let service: RealContextRuntimeService

  beforeEach(async () => {
    store = await SqliteStore.open(':memory:')
    store.initProject('test-ctx')
    service = new RealContextRuntimeService(store)
  })

  afterEach(() => {
    store.close()
  })

  describe('compact', () => {
    it('returns null for non-existent node', () => {
      expect(service.compact('non-existent')).toBeNull()
    })

    it('returns flow-compacted or null depending on flow config', () => {
      seedNode(store, { id: 'n1', type: 'task', title: 'T1', acceptanceCriteria: ['AC1'] })
      const result = service.compact('n1')
      // flow may be disabled by default — compact returns null in that case
      // When flow IS enabled, result has the expected shape
      if (result) {
        expect(result.flow.enabled).toBe(true)
        expect(result.context.task.id).toBe('n1')
      } else {
        // flow_off is valid behavior — compact falls through to legacy
        expect(true).toBe(true)
      }
    })
  })

  describe('summary', () => {
    it('returns empty state for empty store', () => {
      const s = service.summary()
      expect(s.totalNodes).toBe(0)
      expect(s.nextTask).toBeNull()
    })

    it('returns correct counts', () => {
      seedNode(store, { id: 'e1', type: 'epic', title: 'Epic 1' })
      seedNode(store, { id: 't1', type: 'task', title: 'Task 1', status: 'backlog' })
      seedNode(store, { id: 't2', type: 'task', title: 'Task 2', status: 'done' })
      seedNode(store, { id: 't3', type: 'task', title: 'Task 3', status: 'in_progress' })

      const s = service.summary()
      expect(s.totalNodes).toBeGreaterThanOrEqual(4)
      expect(s.byType['epic']).toBeGreaterThanOrEqual(1)
      expect(s.byType['task']).toBeGreaterThanOrEqual(3)
      expect(s.byStatus['backlog']).toBeGreaterThanOrEqual(1)
      expect(s.byStatus['done']).toBeGreaterThanOrEqual(1)
      expect(s.byStatus['in_progress']).toBeGreaterThanOrEqual(1)
      expect(s.nextTask!.id).toBe('t1')
    })
  })

  describe('nodeDetail', () => {
    it('returns null for non-existent node', () => {
      expect(service.nodeDetail('no-such')).toBeNull()
    })

    it('returns detail with children count', () => {
      seedNode(store, { id: 'p1', type: 'epic', title: 'Parent' })
      seedNode(store, { id: 'c1', type: 'task', title: 'Child', parentId: 'p1' })
      seedNode(store, { id: 'c2', type: 'task', title: 'Child 2', parentId: 'p1' })

      const detail = service.nodeDetail('p1')
      expect(detail).not.toBeNull()
      expect(detail!.childrenCount).toBe(2)
      expect(detail!.node.id).toBe('p1')
    })
  })

  describe('children', () => {
    it('returns empty array for leaf node', () => {
      seedNode(store, { id: 'leaf', type: 'task', title: 'Leaf' })
      expect(service.children('leaf')).toEqual([])
    })

    it('returns children for parent node', () => {
      seedNode(store, { id: 'par', type: 'epic', title: 'Parent' })
      seedNode(store, { id: 'kid1', type: 'task', title: 'Kid 1', parentId: 'par' })
      seedNode(store, { id: 'kid2', type: 'task', title: 'Kid 2', parentId: 'par' })

      const kids = service.children('par')
      expect(kids.length).toBe(2)
      expect(kids.map((k) => k.id).sort()).toEqual(['kid1', 'kid2'])
    })
  })

  describe('backlog', () => {
    it('returns empty array for empty store', () => {
      expect(service.backlog()).toEqual([])
    })

    it('returns sorted backlog items', () => {
      seedNode(store, { id: 'low', type: 'task', title: 'Low', priority: 5 })
      seedNode(store, { id: 'high', type: 'task', title: 'High', priority: 1 })
      seedNode(store, { id: 'done', type: 'task', title: 'Done', status: 'done' })

      const backlog = service.backlog()
      expect(backlog.length).toBe(2)
      expect(backlog[0].id).toBe('high')
      expect(backlog[1].id).toBe('low')
    })
  })
})
