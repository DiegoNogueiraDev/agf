/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { SubtaskArtifactsStore } from '../core/store/subtask-artifacts-store.js'
import { OperationError } from '../core/utils/errors.js'

describe('SubtaskArtifactsStore', () => {
  let sqliteStore: SqliteStore
  let store: SubtaskArtifactsStore

  function insertNode(db: import('better-sqlite3').Database, id: string): void {
    db.prepare(
      `INSERT OR IGNORE INTO nodes (id, project_id, type, title, status, priority, created_at, updated_at)
       VALUES (?, (SELECT id FROM projects LIMIT 1), 'task', ?, 'backlog', 3, datetime('now'), datetime('now'))`,
    ).run(id, id)
  }

  beforeEach(() => {
    sqliteStore = SqliteStore.open(':memory:')
    sqliteStore.initProject('test-project')
    // Create node references needed by the FK constraint on subtask_artifacts
    insertNode(sqliteStore.getDb(), 'node_1')
    insertNode(sqliteStore.getDb(), 'node_2')
    insertNode(sqliteStore.getDb(), 'n1')
    insertNode(sqliteStore.getDb(), 'n2')
    insertNode(sqliteStore.getDb(), 'n3')
    store = new SubtaskArtifactsStore(sqliteStore)
  })

  describe('insert', () => {
    it('inserts an artifact and returns its id', () => {
      const id = store.insert({
        nodeId: 'node_1',
        epicId: 'epic_1',
        kind: 'diff',
        content: 'console.log("hello")',
        path: 'src/index.ts',
      })
      expect(id).toBeTruthy()
      expect(id.startsWith('artifact_')).toBe(true)
    })

    it('inserts an artifact with null path', () => {
      const id = store.insert({
        nodeId: 'node_1',
        epicId: 'epic_1',
        kind: 'note',
        content: 'some note content',
      })
      const artifact = store.getById(id)
      expect(artifact).not.toBeNull()
      expect(artifact!.path).toBeNull()
    })

    it('deduplicates: same (epicId, kind, content) returns existing id', () => {
      const id1 = store.insert({
        nodeId: 'node_1',
        epicId: 'epic_1',
        kind: 'file',
        content: 'const x = 1',
        path: 'src/x.ts',
      })
      const id2 = store.insert({
        nodeId: 'node_1',
        epicId: 'epic_1',
        kind: 'file',
        content: 'const x = 1',
        path: 'src/x.ts',
      })
      expect(id2).toBe(id1)
    })

    it('inserts different artifacts for different kinds', () => {
      const id1 = store.insert({
        nodeId: 'node_1',
        epicId: 'epic_1',
        kind: 'diff',
        content: 'content',
      })
      const id2 = store.insert({
        nodeId: 'node_1',
        epicId: 'epic_1',
        kind: 'decision',
        content: 'content',
      })
      expect(id2).not.toBe(id1)
    })

    it('throws OperationError when no project initialized', () => {
      const empty = SqliteStore.open(':memory:')
      const noProjectStore = new SubtaskArtifactsStore(empty)
      expect(() =>
        noProjectStore.insert({
          nodeId: 'n',
          epicId: 'e',
          kind: 'note',
          content: 'test',
        }),
      ).toThrow(OperationError)
      empty.close()
    })
  })

  describe('listByEpic', () => {
    it('returns artifacts for an epic ordered by created_at ASC', async () => {
      store.insert({ nodeId: 'n1', epicId: 'epic_1', kind: 'diff', content: 'first' })
      await new Promise((r) => setTimeout(r, 5))
      store.insert({ nodeId: 'n2', epicId: 'epic_1', kind: 'decision', content: 'second' })
      const artifacts = store.listByEpic('epic_1')
      expect(artifacts).toHaveLength(2)
      expect(artifacts[0].kind).toBe('diff')
      expect(artifacts[1].kind).toBe('decision')
    })

    it('returns empty array for epic with no artifacts', () => {
      expect(store.listByEpic('unknown')).toEqual([])
    })
  })

  describe('listByNode', () => {
    it('returns artifacts for a node', () => {
      store.insert({ nodeId: 'node_1', epicId: 'epic_1', kind: 'diff', content: 'a' })
      store.insert({ nodeId: 'node_2', epicId: 'epic_1', kind: 'decision', content: 'b' })
      const artifacts = store.listByNode('node_1')
      expect(artifacts).toHaveLength(1)
      expect(artifacts[0].kind).toBe('diff')
    })

    it('returns empty for node with no artifacts', () => {
      expect(store.listByNode('unknown')).toEqual([])
    })
  })

  describe('getById', () => {
    it('returns artifact by id', () => {
      const id = store.insert({
        nodeId: 'n1',
        epicId: 'epic_1',
        kind: 'interface',
        content: 'export interface Foo {}',
        path: 'src/types.ts',
      })
      const artifact = store.getById(id)
      expect(artifact).not.toBeNull()
      expect(artifact!.id).toBe(id)
      expect(artifact!.nodeId).toBe('n1')
      expect(artifact!.epicId).toBe('epic_1')
      expect(artifact!.kind).toBe('interface')
      expect(artifact!.path).toBe('src/types.ts')
      expect(artifact!.contentHash).toBeTruthy()
      expect(artifact!.createdAt).toBeTruthy()
    })

    it('returns null for unknown id', () => {
      expect(store.getById('nonexistent')).toBeNull()
    })
  })
})
