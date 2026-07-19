/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { GoldenStore } from '../core/store/golden-store.js'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

describe('GoldenStore', () => {
  let db: Database.Database
  let store: GoldenStore

  const sampleInput = {
    input: 'What is 2+2?',
    expected: '4',
    scorerKind: 'exact_match',
    tool: 'analyze',
    projectId: 'proj_1',
    metadata: { difficulty: 'easy' },
    tags: ['math', 'basic'],
  }

  beforeEach(() => {
    db = createDb()
    store = new GoldenStore(db)
  })

  describe('create', () => {
    it('creates a golden entry and returns it with id and createdAt', () => {
      const entry = store.create(sampleInput)
      expect(entry.id).toBeTruthy()
      expect(entry.id.startsWith('gold_')).toBe(true)
      expect(entry.createdAt).toBeTruthy()
      expect(entry.input).toBe('What is 2+2?')
      expect(entry.expected).toBe('4')
    })

    it('stores metadata and tags as JSON', () => {
      const entry = store.create(sampleInput)
      const row = db.prepare('SELECT * FROM eval_golden WHERE id = ?').get(entry.id) as Record<string, unknown>
      expect(JSON.parse(row.metadata as string)).toEqual({ difficulty: 'easy' })
      expect(JSON.parse(row.tags as string)).toEqual(['math', 'basic'])
    })
  })

  describe('get', () => {
    it('returns a golden entry by id', () => {
      const created = store.create(sampleInput)
      const fetched = store.get(created.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.input).toBe('What is 2+2?')
      expect(fetched!.metadata).toEqual({ difficulty: 'easy' })
      expect(fetched!.tags).toEqual(['math', 'basic'])
    })

    it('returns null for non-existent id', () => {
      expect(store.get('nonexistent')).toBeNull()
    })
  })

  describe('list', () => {
    it('returns all entries when no filter', () => {
      store.create(sampleInput)
      store.create({ ...sampleInput, input: 'What is 3+3?', expected: '6' })
      expect(store.list()).toHaveLength(2)
    })

    it('filters by tool', () => {
      store.create(sampleInput)
      store.create({ ...sampleInput, tool: 'search', input: 'q' })
      const results = store.list({ tool: 'analyze' })
      expect(results).toHaveLength(1)
      expect(results[0].tool).toBe('analyze')
    })

    it('filters by projectId', () => {
      store.create(sampleInput)
      store.create({ ...sampleInput, projectId: 'proj_2' })
      expect(store.list({ projectId: 'proj_1' })).toHaveLength(1)
    })

    it('filters by scorerKind', () => {
      store.create(sampleInput)
      store.create({ ...sampleInput, scorerKind: 'cosine' })
      expect(store.list({ scorerKind: 'exact_match' })).toHaveLength(1)
    })

    it('respects limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        store.create({ ...sampleInput, input: `q${i}` })
      }
      expect(store.list({ limit: 2 })).toHaveLength(2)
    })
  })

  describe('listByTag', () => {
    it('returns entries whose tags contain the requested tag', () => {
      store.create(sampleInput)
      store.create({ ...sampleInput, tags: ['advanced'] })
      const results = store.listByTag('math')
      expect(results).toHaveLength(1)
    })

    it('returns empty array when no entries have the tag', () => {
      store.create(sampleInput)
      expect(store.listByTag('unused')).toEqual([])
    })
  })

  describe('count', () => {
    it('counts all entries when no filter', () => {
      store.create(sampleInput)
      store.create({ ...sampleInput, input: 'q2' })
      expect(store.count()).toBe(2)
    })

    it('counts with filter', () => {
      store.create(sampleInput)
      store.create({ ...sampleInput, tool: 'search' })
      expect(store.count({ tool: 'analyze' })).toBe(1)
    })

    it('returns 0 for empty store', () => {
      expect(store.count()).toBe(0)
    })
  })

  describe('update', () => {
    it('updates fields on an existing entry', () => {
      const created = store.create(sampleInput)
      const updated = store.update(created.id, { expected: '5', metadata: { difficulty: 'hard' } })
      expect(updated).not.toBeNull()
      expect(updated!.expected).toBe('5')
      expect(updated!.metadata).toEqual({ difficulty: 'hard' })
      expect(updated!.input).toBe('What is 2+2?')
    })

    it('returns null for non-existent id', () => {
      expect(store.update('nonexistent', { input: 'test' })).toBeNull()
    })
  })

  describe('delete', () => {
    it('deletes an entry and returns true', () => {
      const created = store.create(sampleInput)
      expect(store.delete(created.id)).toBe(true)
      expect(store.get(created.id)).toBeNull()
    })

    it('returns false for non-existent id', () => {
      expect(store.delete('nonexistent')).toBe(false)
    })
  })
})
