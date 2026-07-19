/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/*!
 * Tests for the testFiles mutator path used by `agf node update --test-files`.
 * Enables remediating phantom_done findings (fix a stale/ghost testFile
 * reference) without hand-editing SQLite.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../schemas/entity.schema.js'

function freshStore(): SqliteStore {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('proj-testfiles')
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

describe('node update --test-files mutator (store.updateNode testFiles)', () => {
  it('replaces the testFiles list on a node', () => {
    const store = freshStore()
    store.insertNode(node('t1', { testFiles: ['src/tests/ghost.test.ts'] }))

    const updated = store.updateNode('t1', { testFiles: ['src/tests/real.test.ts'] })

    expect(updated).not.toBeNull()
    expect(updated?.testFiles).toEqual(['src/tests/real.test.ts'])
    store.close()
  })

  it('leaves testFiles untouched when not part of the update fields', () => {
    const store = freshStore()
    store.insertNode(node('t1', { testFiles: ['src/tests/keep.test.ts'] }))

    const updated = store.updateNode('t1', { title: 'renamed' })

    expect(updated?.title).toBe('renamed')
    expect(updated?.testFiles).toEqual(['src/tests/keep.test.ts'])
    store.close()
  })

  it('can set multiple testFiles on a node that had none', () => {
    const store = freshStore()
    store.insertNode(node('t1'))

    const updated = store.updateNode('t1', { testFiles: ['a.test.ts', 'b.test.ts'] })

    expect(updated?.testFiles).toEqual(['a.test.ts', 'b.test.ts'])
    store.close()
  })
})

describe('implementationFiles (code axis of the triangulation) round-trips through the store', () => {
  it('persists and reads back implementationFiles', () => {
    const store = freshStore()
    store.insertNode(node('t1', { implementationFiles: ['src/core/foo.ts'] }))

    const read = store.getNodeById('t1')

    expect(read?.implementationFiles).toEqual(['src/core/foo.ts'])
    store.close()
  })

  it('updateNode replaces implementationFiles without touching testFiles', () => {
    const store = freshStore()
    store.insertNode(node('t1', { testFiles: ['a.test.ts'], implementationFiles: ['old.ts'] }))

    const updated = store.updateNode('t1', { implementationFiles: ['src/core/new.ts'] })

    expect(updated?.implementationFiles).toEqual(['src/core/new.ts'])
    expect(updated?.testFiles).toEqual(['a.test.ts'])
    store.close()
  })
})
