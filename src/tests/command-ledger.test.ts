/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for src/core/observability/command-ledger.ts — universal agf subcommand invocation ledger.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { recordCommandInvocation, summarizeCommandLedger } from '../core/observability/command-ledger.js'

describe('command-ledger', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE IF NOT EXISTS command_invocations (
        id                TEXT PRIMARY KEY,
        ts                INTEGER NOT NULL,
        command           TEXT NOT NULL,
        input_bytes       INTEGER NOT NULL DEFAULT 0,
        output_bytes      INTEGER NOT NULL DEFAULT 0,
        estimated_tokens  INTEGER NOT NULL DEFAULT 0,
        cached            INTEGER NOT NULL DEFAULT 0,
        duration_ms       INTEGER NOT NULL DEFAULT 0,
        node_id           TEXT,
        session_id        TEXT,
        graph_export_bytes INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_command_invocations_cmd ON command_invocations(command, ts);
    `)
  })

  afterEach(() => {
    db.close()
  })

  describe('recordCommandInvocation', () => {
    it('records a command with input/output bytes', () => {
      const id = recordCommandInvocation(db, {
        command: 'stats',
        inputBytes: 10,
        outputBytes: 337,
        cached: false,
        durationMs: 20,
      })
      expect(id).toBeTruthy()
      expect(id).toMatch(/^cmd_/)
    })

    it('estimates tokens as (input + output) / 4', () => {
      recordCommandInvocation(db, {
        command: 'query',
        inputBytes: 8,
        outputBytes: 400,
        cached: false,
        durationMs: 50,
      })

      const row = db.prepare('SELECT estimated_tokens FROM command_invocations').get() as { estimated_tokens: number }
      // (8 + 400) / 4 = 102
      expect(row.estimated_tokens).toBe(102)
    })

    it('rounds estimated_tokens up', () => {
      recordCommandInvocation(db, {
        command: 'x',
        inputBytes: 1,
        outputBytes: 2,
        cached: false,
        durationMs: 1,
      })
      const row = db.prepare('SELECT estimated_tokens FROM command_invocations').get() as { estimated_tokens: number }
      expect(row.estimated_tokens).toBe(1)
    })
  })

  describe('summarizeCommandLedger', () => {
    it('returns zero summary for empty ledger', () => {
      const summary = summarizeCommandLedger(db)
      expect(summary).toEqual({
        calls: 0,
        inputBytes: 0,
        outputBytes: 0,
        estimatedTokens: 0,
        cachedCalls: 0,
        avgDurationMs: 0,
        graphExportBytes: 0,
        callsWithGraphData: 0,
        maxGraphExportBytes: 0,
        activeDays: 0,
      })
    })

    it('summarizes multiple invocations', () => {
      recordCommandInvocation(db, { command: 'a', inputBytes: 10, outputBytes: 90, cached: false, durationMs: 100 })
      recordCommandInvocation(db, { command: 'b', inputBytes: 20, outputBytes: 80, cached: true, durationMs: 200 })

      const summary = summarizeCommandLedger(db)
      expect(summary.calls).toBe(2)
      expect(summary.inputBytes).toBe(30)
      expect(summary.outputBytes).toBe(170)
      expect(summary.estimatedTokens).toBe(50) // (10+90+20+80)/4 = 50
      expect(summary.cachedCalls).toBe(1)
      expect(summary.avgDurationMs).toBe(150)
      expect(summary.graphExportBytes).toBe(0)
      expect(summary.callsWithGraphData).toBe(0)
    })

    it('sums graph_export_bytes and counts calls with data', () => {
      recordCommandInvocation(db, {
        command: 'a',
        inputBytes: 0,
        outputBytes: 0,
        cached: false,
        durationMs: 10,
        graphExportBytes: 5000,
      })
      recordCommandInvocation(db, {
        command: 'b',
        inputBytes: 0,
        outputBytes: 0,
        cached: false,
        durationMs: 10,
        graphExportBytes: 5000,
      })
      recordCommandInvocation(db, { command: 'c', inputBytes: 0, outputBytes: 0, cached: false, durationMs: 10 }) // no graph data

      const summary = summarizeCommandLedger(db)
      expect(summary.graphExportBytes).toBe(10000)
      expect(summary.callsWithGraphData).toBe(2)
      expect(summary.calls).toBe(3)
    })

    it('reports the max graph export size and the count of distinct active days', () => {
      // Bounding the delegate baseline needs "one full read" (maxGraphExportBytes) and the
      // number of read-episodes (activeDays), so Σ(full graph × every call) can be clamped.
      const day1 = 1_704_067_200_000 // 2024-01-01 UTC
      const day2 = 1_704_153_600_000 // 2024-01-02 UTC
      const insert = db.prepare(
        `INSERT INTO command_invocations
          (id, ts, command, input_bytes, output_bytes, estimated_tokens, cached, duration_ms, node_id, session_id, graph_export_bytes)
         VALUES (?, ?, ?, 0, 0, 0, 0, 10, NULL, NULL, ?)`,
      )
      insert.run('c1', day1, 'a', 5000)
      insert.run('c2', day1, 'b', 9000)
      insert.run('c3', day2, 'c', 3000)

      const summary = summarizeCommandLedger(db)
      expect(summary.maxGraphExportBytes).toBe(9000)
      expect(summary.activeDays).toBe(2)
    })

    it('filters by sessionId', () => {
      recordCommandInvocation(db, {
        command: 'a',
        inputBytes: 10,
        outputBytes: 10,
        cached: false,
        durationMs: 10,
        sessionId: 's1',
      })
      recordCommandInvocation(db, {
        command: 'b',
        inputBytes: 20,
        outputBytes: 20,
        cached: false,
        durationMs: 10,
        sessionId: 's2',
      })

      const s1 = summarizeCommandLedger(db, { sessionId: 's1' })
      expect(s1.calls).toBe(1)
      expect(s1.inputBytes).toBe(10)

      const s2 = summarizeCommandLedger(db, { sessionId: 's2' })
      expect(s2.calls).toBe(1)
      expect(s2.inputBytes).toBe(20)
    })
  })
})
