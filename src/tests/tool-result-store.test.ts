/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { ToolResultStore } from '../core/store/tool-result-store.js'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

describe('ToolResultStore', () => {
  let db: Database.Database
  let store: ToolResultStore

  beforeEach(() => {
    db = createDb()
    store = new ToolResultStore(db)
  })

  describe('record', () => {
    it('stores a tool result and returns an id', () => {
      const id = store.record('proj_1', null, 'analyze', { mode: 'ready' }, { passed: true })
      expect(id).toBeTruthy()
      expect(id.startsWith('toolres_')).toBe(true)
    })

    it('records input args as JSON and result as JSON', () => {
      const id = store.record('proj_1', 'trace_1', 'search', { q: 'hello' }, { count: 5 })
      const row = db.prepare('SELECT * FROM tool_results').get() as Record<string, unknown>
      expect(row.id).toBe(id)
      expect(row.tool_name).toBe('search')
      expect(row.trace_id).toBe('trace_1')
    })

    it('truncates results larger than 100KB', () => {
      const big = 'x'.repeat(150_000)
      const id = store.record('proj_1', null, 'big-tool', {}, big)
      const row = db.prepare('SELECT * FROM tool_results WHERE id = ?').get(id) as Record<string, unknown>
      expect(row.truncated).toBe(1)
      expect(String(row.result).length).toBeLessThanOrEqual(102_400)
    })

    it('computes sha256 hash (first 16 hex chars)', () => {
      const id = store.record('proj_1', null, 'analyze', {}, { data: 42 })
      const row = db.prepare('SELECT result_hash FROM tool_results WHERE id = ?').get(id) as { result_hash: string }
      expect(row.result_hash).toHaveLength(16)
    })
  })

  describe('getByTrace', () => {
    it('returns results for a trace ordered by created_at ASC', () => {
      store.record('proj_1', 'trace_1', 'analyze', {}, { step: 1 })
      store.record('proj_1', 'trace_1', 'search', {}, { step: 2 })
      const results = store.getByTrace('trace_1')
      expect(results).toHaveLength(2)
      expect(results[0].toolName).toBe('analyze')
      expect(results[1].toolName).toBe('search')
    })

    it('returns empty array for unknown trace', () => {
      expect(store.getByTrace('unknown')).toEqual([])
    })
  })

  describe('getByToolName', () => {
    it('returns results for a tool ordered by created_at DESC', () => {
      store.record('proj_1', null, 'analyze', {}, { n: 1 })
      store.record('proj_1', null, 'analyze', {}, { n: 2 })
      store.record('proj_1', null, 'search', {}, { n: 3 })
      const results = store.getByToolName('proj_1', 'analyze')
      expect(results).toHaveLength(2)
      expect(results[0].toolName).toBe('analyze')
    })

    it('respects limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        store.record('proj_1', null, 'analyze', {}, { n: i })
      }
      expect(store.getByToolName('proj_1', 'analyze', 3)).toHaveLength(3)
    })

    it('returns empty array when no results for tool', () => {
      expect(store.getByToolName('proj_1', 'nonexistent')).toEqual([])
    })
  })

  describe('rowToEntry mapping', () => {
    it('maps all fields correctly', () => {
      const id = store.record('proj_1', 'trace_x', 'analyze', { mode: 'test' }, { ok: true })
      const results = store.getByTrace('trace_x')
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe(id)
      expect(results[0].projectId).toBe('proj_1')
      expect(results[0].traceId).toBe('trace_x')
      expect(results[0].toolName).toBe('analyze')
      expect(results[0].truncated).toBe(false)
    })
  })
})
