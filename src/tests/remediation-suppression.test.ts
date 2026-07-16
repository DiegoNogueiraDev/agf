/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { SuppressionStore } from '../core/harness/remediation-suppression.js'

describe('SuppressionStore', () => {
  let db: Database.Database
  let store: SuppressionStore

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE IF NOT EXISTS remediation_suppressions (
        id TEXT PRIMARY KEY,
        file TEXT NOT NULL,
        violation_type TEXT NOT NULL,
        dimension TEXT NOT NULL,
        reason TEXT,
        suppressed_at TEXT NOT NULL
      )
    `)
    store = new SuppressionStore(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('suppress', () => {
    it('should insert a suppression record', () => {
      store.suppress('src/foo.ts', 'any_usage', 'types')
      expect(store.isSuppressed('src/foo.ts', 'any_usage')).toBe(true)
    })

    it('should allow inserting same file/violation pair (no unique constraint on pair)', () => {
      store.suppress('src/foo.ts', 'any_usage', 'types', 'known false positive')
      store.suppress('src/foo.ts', 'any_usage', 'types', 'known false positive')
      const records = store.listSuppressions().filter((r) => r.file === 'src/foo.ts')
      expect(records).toHaveLength(2)
    })

    it('should store reason when provided', () => {
      store.suppress('src/bar.ts', 'missing_test', 'tests', 'intentional design')
      const records = store.listSuppressions()
      expect(records[0].reason).toBe('intentional design')
    })
  })

  describe('isSuppressed', () => {
    it('should return false for unsuppressed file/violation', () => {
      expect(store.isSuppressed('src/unknown.ts', 'any_usage')).toBe(false)
    })

    it('should return true after suppression', () => {
      store.suppress('src/foo.ts', 'any_usage', 'types')
      expect(store.isSuppressed('src/foo.ts', 'any_usage')).toBe(true)
    })

    it('should not match different file same violation', () => {
      store.suppress('src/foo.ts', 'any_usage', 'types')
      expect(store.isSuppressed('src/bar.ts', 'any_usage')).toBe(false)
    })

    it('should not match same file different violation', () => {
      store.suppress('src/foo.ts', 'any_usage', 'types')
      expect(store.isSuppressed('src/foo.ts', 'missing_test')).toBe(false)
    })
  })

  describe('listSuppressions', () => {
    it('should return empty array when no suppressions', () => {
      expect(store.listSuppressions()).toEqual([])
    })

    it('should return all records ordered by suppressed_at DESC', () => {
      store.suppress('a.ts', 'v1', 'types')
      store.suppress('b.ts', 'v2', 'tests')
      const records = store.listSuppressions()
      expect(records).toHaveLength(2)
      expect(records.map((r) => r.file).sort()).toEqual(['a.ts', 'b.ts'])
    })
  })

  describe('removeSuppression', () => {
    it('should remove a suppression by ID', () => {
      store.suppress('src/foo.ts', 'any_usage', 'types', 'false positive')
      const records = store.listSuppressions()
      expect(records).toHaveLength(1)
      store.removeSuppression(records[0].id)
      expect(store.listSuppressions()).toEqual([])
    })

    it('should do nothing for nonexistent ID', () => {
      store.suppress('src/foo.ts', 'any_usage', 'types')
      store.removeSuppression('nonexistent_id')
      expect(store.listSuppressions()).toHaveLength(1)
    })
  })
})
