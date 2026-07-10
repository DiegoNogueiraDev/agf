/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { ToolCallLog } from '../core/store/tool-call-log.js'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

describe('ToolCallLog', () => {
  let db: Database.Database
  let log: ToolCallLog

  beforeEach(() => {
    db = createDb()
    log = new ToolCallLog(db)
  })

  describe('record', () => {
    it('records a tool call with projectId and toolName', () => {
      log.record('proj_1', null, 'analyze')
      const calls = db.prepare('SELECT * FROM tool_call_log').all()
      expect(calls).toHaveLength(1)
    })

    it('records with optional nodeId and toolArgs', () => {
      log.record('proj_1', 'node_1', 'search', 'arg value')
      const row = db.prepare('SELECT * FROM tool_call_log').get() as Record<string, unknown>
      expect(row.node_id).toBe('node_1')
      expect(row.tool_args).toBe('arg value')
    })

    it('records multiple calls for the same project', () => {
      log.record('proj_1', null, 'analyze')
      log.record('proj_1', null, 'search')
      log.record('proj_1', null, 'analyze')
      const rows = db.prepare('SELECT * FROM tool_call_log').all()
      expect(rows).toHaveLength(3)
    })
  })

  describe('hasBeenCalled', () => {
    it('returns true when tool was called project-wide (nodeId=null)', () => {
      log.record('proj_1', null, 'analyze')
      expect(log.hasBeenCalled('proj_1', null, 'analyze')).toBe(true)
    })

    it('returns false when tool was not called', () => {
      expect(log.hasBeenCalled('proj_1', null, 'unknown')).toBe(false)
    })

    it('returns true when tool was called for a specific node', () => {
      log.record('proj_1', 'node_1', 'analyze')
      expect(log.hasBeenCalled('proj_1', 'node_1', 'analyze')).toBe(true)
    })

    it('returns false for different nodeId', () => {
      log.record('proj_1', 'node_1', 'analyze')
      expect(log.hasBeenCalled('proj_1', 'node_2', 'analyze')).toBe(false)
    })

    it('checks toolArgs with LIKE pattern when provided', () => {
      log.record('proj_1', 'node_1', 'analyze', '{"mode":"ready"}')
      expect(log.hasBeenCalled('proj_1', 'node_1', 'analyze', 'ready')).toBe(true)
      expect(log.hasBeenCalled('proj_1', 'node_1', 'analyze', 'deploy')).toBe(false)
    })

    it('returns false for different project', () => {
      log.record('proj_1', null, 'analyze')
      expect(log.hasBeenCalled('proj_2', null, 'analyze')).toBe(false)
    })
  })

  describe('getCallsForNode', () => {
    it('returns calls for a specific node in ASC order', () => {
      log.record('proj_1', 'node_1', 'analyze')
      log.record('proj_1', 'node_1', 'search')
      const calls = log.getCallsForNode('proj_1', 'node_1')
      expect(calls).toHaveLength(2)
      expect(calls[0].toolName).toBe('analyze')
      expect(calls[1].toolName).toBe('search')
    })

    it('returns empty array for node with no calls', () => {
      const calls = log.getCallsForNode('proj_1', 'nonexistent')
      expect(calls).toEqual([])
    })

    it('does not return calls from other nodes', () => {
      log.record('proj_1', 'node_1', 'analyze')
      log.record('proj_1', 'node_2', 'search')
      const calls = log.getCallsForNode('proj_1', 'node_1')
      expect(calls).toHaveLength(1)
      expect(calls[0].toolName).toBe('analyze')
    })
  })

  describe('clearProject', () => {
    it('removes all log entries for a project', () => {
      log.record('proj_1', null, 'analyze')
      log.record('proj_1', null, 'search')
      log.record('proj_2', null, 'analyze')
      log.clearProject('proj_1')
      expect(db.prepare('SELECT COUNT(*) as c FROM tool_call_log').get()).toEqual({ c: 1 })
    })
  })

  describe('getModeCallCounts', () => {
    it('aggregates call counts per mode from tool_args JSON', () => {
      log.record('proj_1', null, 'analyze', '{"mode":"ready"}')
      log.record('proj_1', null, 'analyze', '{"mode":"ready"}')
      log.record('proj_1', null, 'analyze', '{"mode":"deploy"}')
      const counts = log.getModeCallCounts('proj_1', 'analyze')
      expect(counts).toHaveLength(2)
      const ready = counts.find((c) => c.mode === 'ready')
      expect(ready?.callCount).toBe(2)
      const deploy = counts.find((c) => c.mode === 'deploy')
      expect(deploy?.callCount).toBe(1)
    })

    it('includes zero-count orphan candidates when provided', () => {
      log.record('proj_1', null, 'analyze', '{"mode":"ready"}')
      const counts = log.getModeCallCounts('proj_1', 'analyze', undefined, ['ready', 'deploy', 'orphan'])
      expect(counts).toHaveLength(3)
      const orphan = counts.find((c) => c.mode === 'orphan')
      expect(orphan?.callCount).toBe(0)
      expect(orphan?.lastCalledAt).toBeNull()
    })

    it('returns empty array when no calls for tool', () => {
      const counts = log.getModeCallCounts('proj_1', 'nonexistent')
      expect(counts).toEqual([])
    })
  })
})
