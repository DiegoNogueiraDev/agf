/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  recordBlock,
  getSessionTokensConsumed,
  getBaselineContinuation,
  aggregateSavings,
  recordHarnessBlock,
} from '../core/harness/savings-ledger.js'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS harness_savings_ledger (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      block_type TEXT NOT NULL,
      blocker_module TEXT NOT NULL,
      node_id TEXT,
      session_id TEXT,
      tokens_consumed INTEGER NOT NULL,
      baseline_continuation INTEGER NOT NULL,
      baseline_n INTEGER NOT NULL,
      savings_tokens INTEGER NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'unknown',
      evidence_json TEXT,
      timestamp TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS llm_call_ledger (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0
    );
  `)
  return db
}

describe('savings-ledger', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createDb()
  })

  describe('recordBlock', () => {
    it('inserts a row and returns an id', () => {
      const id = recordBlock(db, {
        projectId: 'proj_test',
        blockType: 'regression_gate',
        blockerModule: 'harness-preflight.ts',
        tokensConsumed: 1000,
        baselineContinuation: 5000,
        baselineN: 3,
      })
      expect(id).toMatch(/^harness_savings_/)

      const row = db.prepare('SELECT * FROM harness_savings_ledger WHERE id = ?').get(id) as any
      expect(row.block_type).toBe('regression_gate')
      expect(row.savings_tokens).toBe(4000)
    })

    it('stores optional evidence JSON', () => {
      const id = recordBlock(db, {
        projectId: 'proj_test',
        blockType: 'test_gate',
        blockerModule: 'test-gate.ts',
        nodeId: 'node-123',
        sessionId: 'sess-abc',
        tokensConsumed: 500,
        baselineContinuation: 2000,
        baselineN: 5,
        evidence: { reason: 'test failure' },
      })
      const row = db.prepare('SELECT evidence_json FROM harness_savings_ledger WHERE id = ?').get(id) as any
      expect(JSON.parse(row.evidence_json)).toEqual({ reason: 'test failure' })
    })
  })

  describe('getSessionTokensConsumed', () => {
    it('returns 0 when no ledger rows match', () => {
      const total = getSessionTokensConsumed(db, 'non-existent')
      expect(total).toBe(0)
    })

    it('sums token fields for a session', () => {
      const sessId = 'sess-xyz'
      db.prepare(
        "INSERT INTO llm_call_ledger (id, session_id, input_tokens, output_tokens, cache_creation_tokens) VALUES ('a', ?, 100, 200, 50)",
      ).run(sessId)
      db.prepare(
        "INSERT INTO llm_call_ledger (id, session_id, input_tokens, output_tokens, cache_creation_tokens) VALUES ('b', ?, 300, 400, 0)",
      ).run(sessId)
      expect(getSessionTokensConsumed(db, sessId)).toBe(1050)
    })
  })

  describe('getBaselineContinuation', () => {
    it('returns zeroes when no history exists', () => {
      const result = getBaselineContinuation(db, 'regression_gate')
      expect(result.avg).toBe(0)
      expect(result.n).toBe(0)
    })

    it('averages past baseline_continuation values', () => {
      recordBlock(db, {
        projectId: 'proj_test',
        blockType: 'regression_gate',
        blockerModule: 'test.ts',
        tokensConsumed: 100,
        baselineContinuation: 1000,
        baselineN: 3,
      })
      recordBlock(db, {
        projectId: 'proj_test',
        blockType: 'regression_gate',
        blockerModule: 'test.ts',
        tokensConsumed: 200,
        baselineContinuation: 2000,
        baselineN: 3,
      })
      const result = getBaselineContinuation(db, 'regression_gate')
      expect(result.avg).toBe(1500)
      expect(result.n).toBe(2)
    })
  })

  describe('aggregateSavings', () => {
    it('returns zero totals for empty ledger', () => {
      const summary = aggregateSavings(db, 'proj_test')
      expect(summary.totalSavingsTokens).toBe(0)
      expect(summary.totalBlocks).toBe(0)
      expect(summary.byBlockType).toEqual([])
    })

    it('groups by blockType', () => {
      recordBlock(db, {
        projectId: 'proj_test',
        blockType: 'regression_gate',
        blockerModule: 'test.ts',
        tokensConsumed: 100,
        baselineContinuation: 1000,
        baselineN: 3,
      })
      recordBlock(db, {
        projectId: 'proj_test',
        blockType: 'test_gate',
        blockerModule: 'test.ts',
        tokensConsumed: 100,
        baselineContinuation: 500,
        baselineN: 3,
      })
      recordBlock(db, {
        projectId: 'proj_test',
        blockType: 'regression_gate',
        blockerModule: 'test.ts',
        tokensConsumed: 200,
        baselineContinuation: 1500,
        baselineN: 3,
      })
      const summary = aggregateSavings(db, 'proj_test')
      expect(summary.totalBlocks).toBe(3)
      expect(summary.totalSavingsTokens).toBeGreaterThan(0)
      expect(summary.byBlockType).toHaveLength(2)
      const reg = summary.byBlockType.find((b) => b.blockType === 'regression_gate')
      expect(reg!.count).toBe(2)
    })
  })

  describe('recordHarnessBlock', () => {
    it('derives tokensConsumed/baseline from the ledger and records a row', () => {
      db.prepare(
        "INSERT INTO llm_call_ledger (id, session_id, input_tokens, output_tokens, cache_creation_tokens) VALUES ('a', 'sess-1', 100, 50, 0)",
      ).run()
      recordBlock(db, {
        projectId: 'proj_local',
        blockType: 'dod_failed',
        blockerModule: 'done-cmd.ts',
        tokensConsumed: 100,
        baselineContinuation: 900,
        baselineN: 3,
      })

      const id = recordHarnessBlock(db, {
        blockType: 'dod_failed',
        blockerModule: 'done-cmd.ts',
        nodeId: 'node-1',
        sessionId: 'sess-1',
      })

      const row = db.prepare('SELECT * FROM harness_savings_ledger WHERE id = ?').get(id) as any
      expect(row.project_id).toBe('proj_local')
      expect(row.node_id).toBe('node-1')
      expect(row.session_id).toBe('sess-1')
      expect(row.tokens_consumed).toBe(150)
      expect(row.baseline_continuation).toBe(900)
      expect(row.baseline_n).toBe(1)
    })

    it('defaults tokensConsumed to 0 and baseline to zeroes with no session/history', () => {
      const id = recordHarnessBlock(db, {
        blockType: 'first_ever_block',
        blockerModule: 'done-cmd.ts',
      })
      const row = db.prepare('SELECT * FROM harness_savings_ledger WHERE id = ?').get(id) as any
      expect(row.tokens_consumed).toBe(0)
      expect(row.baseline_continuation).toBe(0)
      expect(row.baseline_n).toBe(0)
      expect(row.source).toBe('unknown')
    })
  })
})
