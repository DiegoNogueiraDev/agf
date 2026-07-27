/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { ToolTokenStore } from '../core/store/tool-token-store.js'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  db.prepare(
    `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))`,
  ).run('proj_1', 'test')
  db.prepare(
    `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))`,
  ).run('proj_2', 'other')
  return db
}

describe('ToolTokenStore', () => {
  let db: Database.Database
  let store: ToolTokenStore

  beforeEach(() => {
    db = createDb()
    store = new ToolTokenStore(db)
  })

  describe('record', () => {
    it('records token usage for a tool', () => {
      store.record('proj_1', 'analyze', 100, 20)
      const row = db.prepare('SELECT * FROM tool_token_usage').get() as Record<string, unknown>
      expect(row.tool_name).toBe('analyze')
      expect(row.input_tokens).toBe(100)
      expect(row.output_tokens).toBe(20)
    })

    it('records multiple entries', () => {
      store.record('proj_1', 'analyze', 100, 20)
      store.record('proj_1', 'search', 50, 10)
      expect(db.prepare('SELECT COUNT(*) as c FROM tool_token_usage').get()).toEqual({ c: 2 })
    })
  })

  describe('getPerToolStats', () => {
    it('returns aggregates per tool ordered by total tokens DESC', () => {
      store.record('proj_1', 'analyze', 100, 20)
      store.record('proj_1', 'analyze', 200, 40)
      store.record('proj_1', 'search', 50, 10)
      const stats = store.getPerToolStats('proj_1')
      expect(stats).toHaveLength(2)
      expect(stats[0].toolName).toBe('analyze')
      expect(stats[0].callCount).toBe(2)
      expect(stats[0].totalInputTokens).toBe(300)
      expect(stats[0].totalOutputTokens).toBe(60)
      expect(stats[0].avgInputTokens).toBe(150)
      expect(stats[0].avgOutputTokens).toBe(30)
      expect(stats[1].toolName).toBe('search')
      expect(stats[1].callCount).toBe(1)
    })

    it('returns empty array for project with no data', () => {
      expect(store.getPerToolStats('empty')).toEqual([])
    })
  })

  describe('getRecentCalls', () => {
    it('returns recent calls ordered by called_at DESC, id DESC', () => {
      store.record('proj_1', 'analyze', 100, 20)
      store.record('proj_1', 'search', 50, 10)
      const recent = store.getRecentCalls('proj_1')
      expect(recent).toHaveLength(2)
      expect(recent[0].toolName).toBe('search')
      expect(recent[1].toolName).toBe('analyze')
    })

    it('respects limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        store.record('proj_1', 't', 10, 5)
      }
      expect(store.getRecentCalls('proj_1', 2)).toHaveLength(2)
    })
  })

  describe('getSummary', () => {
    it('returns aggregates and recent calls', () => {
      store.record('proj_1', 'analyze', 100, 20)
      store.record('proj_1', 'search', 50, 10)
      const summary = store.getSummary('proj_1')
      expect(summary.totalCalls).toBe(2)
      expect(summary.totalInputTokens).toBe(150)
      expect(summary.totalOutputTokens).toBe(30)
      expect(summary.perTool).toHaveLength(2)
      expect(summary.recentCalls).toHaveLength(2)
    })

    it('returns zeros for empty project', () => {
      const summary = store.getSummary('empty')
      expect(summary.totalCalls).toBe(0)
      expect(summary.totalInputTokens).toBe(0)
      expect(summary.totalOutputTokens).toBe(0)
      expect(summary.perTool).toEqual([])
      expect(summary.recentCalls).toEqual([])
    })
  })

  describe('clearProject', () => {
    it('removes all data for a project', () => {
      store.record('proj_1', 'analyze', 100, 20)
      store.record('proj_2', 'analyze', 50, 10)
      store.clearProject('proj_1')
      expect(store.getSummary('proj_1').totalCalls).toBe(0)
      expect(store.getSummary('proj_2').totalCalls).toBe(1)
    })
  })

  describe('recordCall (V11 Maestro)', () => {
    it('records with telemetry fields', () => {
      store.recordCall('proj_1', 'analyze', {
        inputTokens: 100,
        outputTokens: 20,
        success: true,
        durationMs: 500,
        errorKind: undefined,
      })
      const row = db.prepare('SELECT * FROM tool_token_usage').get() as Record<string, unknown>
      expect(row.success).toBe(1)
      expect(row.duration_ms).toBe(500)
      expect(row.error_kind).toBeNull()
    })

    it('records failed calls with errorKind', () => {
      store.recordCall('proj_1', 'analyze', {
        inputTokens: 50,
        outputTokens: 0,
        success: false,
        durationMs: 100,
        errorKind: 'timeout',
      })
      const row = db.prepare('SELECT * FROM tool_token_usage').get() as Record<string, unknown>
      expect(row.success).toBe(0)
      expect(row.error_kind).toBe('timeout')
    })
  })

  describe('getUsageStats', () => {
    it('returns per-tool stats including success rate and p95', () => {
      store.recordCall('proj_1', 'analyze', { inputTokens: 100, outputTokens: 20, success: true, durationMs: 100 })
      store.recordCall('proj_1', 'analyze', { inputTokens: 200, outputTokens: 40, success: true, durationMs: 200 })
      store.recordCall('proj_1', 'analyze', { inputTokens: 50, outputTokens: 10, success: false, durationMs: 300 })
      const stats = store.getUsageStats('proj_1')
      expect(stats).toHaveLength(1)
      expect(stats[0].toolName).toBe('analyze')
      expect(stats[0].callCount).toBe(3)
      expect(stats[0].avgDurationMs).toBe(200)
      expect(stats[0].p95DurationMs).toBe(300)
    })

    it('returns empty array for project with no data', () => {
      expect(store.getUsageStats('empty')).toEqual([])
    })
  })
})
