/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { checkEpicPromotion, autoPromoteEpic, cascadeDownOnDone } from '../core/utils/epic-promotion.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'

interface MockNode {
  id: string
  type: string
  title: string
  status: string
  parentId?: string | null
}

function buildMockStore(nodes: MockNode[]): SqliteStore {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'task',
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'backlog',
      priority INTEGER NOT NULL DEFAULT 3,
      parentId TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      from_node TEXT NOT NULL,
      to_node TEXT NOT NULL,
      relation_type TEXT NOT NULL DEFAULT 'related_to',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  const insert = db.prepare(
    'INSERT OR IGNORE INTO nodes (id, type, title, status, priority, parentId) VALUES (?, ?, ?, ?, 3, ?)',
  )
  for (const n of nodes) {
    insert.run(n.id, n.type, n.title, n.status, n.parentId ?? null)
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  return {
    db,
    toGraphDocument: () => ({
      version: '1',
      project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        status: n.status,
        priority: 3 as const,
        parentId: n.parentId ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })) as GraphNode[],
      edges: [],
      indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
      meta: { sourceFiles: [], lastImport: null },
    }),
    getNodeById: (id: string) => {
      const raw = nodeMap.get(id)
      if (!raw) return null
      return {
        id: raw.id,
        type: raw.type,
        title: raw.title,
        status: raw.status,
        priority: 3 as const,
        parentId: raw.parentId ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as GraphNode
    },
    getChildNodes: (parentId: string) => {
      return nodes
        .filter((n) => n.parentId === parentId)
        .map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          status: n.status,
          priority: 3 as const,
          parentId: n.parentId ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })) as GraphNode[]
    },
    updateNodeStatus: (id: string, status: string) => {
      const raw = nodeMap.get(id)
      if (!raw) return null
      raw.status = status
      return {
        id: raw.id,
        type: raw.type,
        title: raw.title,
        status: raw.status,
        priority: 3 as const,
        parentId: raw.parentId ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as GraphNode
    },
  } as unknown as SqliteStore
}

describe('checkEpicPromotion', () => {
  it('returns suggestion when all siblings are done and parent is not', () => {
    const store = buildMockStore([
      { id: 'parent', type: 'epic', title: 'My Epic', status: 'in_progress' },
      { id: 'child1', type: 'task', title: 'Task 1', status: 'done', parentId: 'parent' },
      { id: 'child2', type: 'task', title: 'Task 2', status: 'done', parentId: 'parent' },
    ])
    const result = checkEpicPromotion(store, 'child1')
    expect(result).not.toBeNull()
    expect(result!.parentId).toBe('parent')
    expect(result!.parentTitle).toBe('My Epic')
    expect(result!.childrenDone).toBe(2)
    expect(result!.suggestion).toContain('My Epic')
  })

  it('returns null when node has no parent', () => {
    const store = buildMockStore([{ id: 'orphan', type: 'task', title: 'Orphan', status: 'done' }])
    expect(checkEpicPromotion(store, 'orphan')).toBeNull()
  })

  it('returns null when not all siblings done', () => {
    const store = buildMockStore([
      { id: 'parent', type: 'epic', title: 'Epic', status: 'in_progress' },
      { id: 'child1', type: 'task', title: 'Done task', status: 'done', parentId: 'parent' },
      { id: 'child2', type: 'task', title: 'Pending task', status: 'in_progress', parentId: 'parent' },
    ])
    expect(checkEpicPromotion(store, 'child1')).toBeNull()
  })

  it('returns null when parent is already done', () => {
    const store = buildMockStore([
      { id: 'parent', type: 'epic', title: 'Done Epic', status: 'done' },
      { id: 'child1', type: 'task', title: 'Task', status: 'done', parentId: 'parent' },
    ])
    expect(checkEpicPromotion(store, 'child1')).toBeNull()
  })

  it('returns null when node not found', () => {
    const store = buildMockStore([])
    expect(checkEpicPromotion(store, 'nonexistent')).toBeNull()
  })
})

describe('autoPromoteEpic', () => {
  it('promotes parent to done when all children done', () => {
    const store = buildMockStore([
      { id: 'parent', type: 'epic', title: 'Epic', status: 'in_progress' },
      { id: 'child1', type: 'task', title: 'Task 1', status: 'done', parentId: 'parent' },
      { id: 'child2', type: 'task', title: 'Task 2', status: 'done', parentId: 'parent' },
    ])
    const result = autoPromoteEpic(store, 'child1')
    expect(result.promoted).toContain('parent')
  })

  it('recursively promotes grandparent when applicable', () => {
    const store = buildMockStore([
      { id: 'grandparent', type: 'epic', title: 'Grand Epic', status: 'in_progress' },
      { id: 'parent', type: 'epic', title: 'Parent Epic', status: 'in_progress', parentId: 'grandparent' },
      { id: 'child1', type: 'task', title: 'Task 1', status: 'done', parentId: 'parent' },
      { id: 'child2', type: 'task', title: 'Task 2', status: 'done', parentId: 'parent' },
    ])
    const result = autoPromoteEpic(store, 'child1')
    expect(result.promoted).toContain('parent')
    expect(result.promoted).toContain('grandparent')
  })

  it('stops at depth limit', () => {
    const store = buildMockStore([
      { id: 'gp', type: 'epic', title: 'Grandparent', status: 'in_progress' },
      { id: 'p1', type: 'epic', title: 'Parent 1', status: 'in_progress', parentId: 'gp' },
      { id: 'p2', type: 'epic', title: 'Parent 2', status: 'in_progress', parentId: 'p1' },
      { id: 'c', type: 'task', title: 'Child', status: 'done', parentId: 'p2' },
    ])
    const result = autoPromoteEpic(store, 'c', 9)
    expect(result.promoted.length).toBe(1)
  })

  it('returns empty when no parent', () => {
    const store = buildMockStore([{ id: 'orphan', type: 'task', title: 'Orphan', status: 'done' }])
    const result = autoPromoteEpic(store, 'orphan')
    expect(result.promoted).toEqual([])
  })

  it('returns empty when parent already done', () => {
    const store = buildMockStore([
      { id: 'parent', type: 'epic', title: 'Done Epic', status: 'done' },
      { id: 'child', type: 'task', title: 'Task', status: 'done', parentId: 'parent' },
    ])
    const result = autoPromoteEpic(store, 'child')
    expect(result.promoted).toEqual([])
  })
})

describe('cascadeDownOnDone', () => {
  it('cascades done to acceptance_criteria children', () => {
    const store = buildMockStore([
      { id: 'parent', type: 'task', title: 'Task', status: 'done' },
      { id: 'ac1', type: 'acceptance_criteria', title: 'AC1', status: 'in_progress', parentId: 'parent' },
    ])
    const result = cascadeDownOnDone(store, 'parent')
    expect(result.cascaded).toContain('ac1')
  })

  it('cascades done to subtask children', () => {
    const store = buildMockStore([
      { id: 'parent', type: 'task', title: 'Task', status: 'done' },
      { id: 'sub1', type: 'subtask', title: 'Subtask', status: 'in_progress', parentId: 'parent' },
    ])
    const result = cascadeDownOnDone(store, 'parent')
    expect(result.cascaded).toContain('sub1')
  })

  it('does NOT cascade to task or epic children', () => {
    const store = buildMockStore([
      { id: 'parent', type: 'epic', title: 'Epic', status: 'done' },
      { id: 'childTask', type: 'task', title: 'Task child', status: 'in_progress', parentId: 'parent' },
    ])
    const result = cascadeDownOnDone(store, 'parent')
    expect(result.cascaded).toEqual([])
  })

  it('returns empty when parent is not done', () => {
    const store = buildMockStore([
      { id: 'parent', type: 'task', title: 'Task', status: 'in_progress' },
      { id: 'ac1', type: 'acceptance_criteria', title: 'AC1', status: 'backlog', parentId: 'parent' },
    ])
    const result = cascadeDownOnDone(store, 'parent')
    expect(result.cascaded).toEqual([])
  })

  it('does not cascade to already-done children', () => {
    const store = buildMockStore([
      { id: 'parent', type: 'task', title: 'Task', status: 'done' },
      { id: 'ac1', type: 'acceptance_criteria', title: 'AC1', status: 'done', parentId: 'parent' },
    ])
    const result = cascadeDownOnDone(store, 'parent')
    expect(result.cascaded).toEqual([])
  })
})
