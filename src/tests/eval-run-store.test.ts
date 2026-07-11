/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { EvalRunStore } from '../core/store/eval-run-store.js'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

function createGolden(db: Database.Database, id: string, tool: string = 'analyze'): void {
  db.prepare(
    `INSERT INTO eval_golden (id, input, expected, scorer_kind, tool, project_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(id, 'input', 'expected', 'exact_match', tool, null)
}

describe('EvalRunStore', () => {
  let db: Database.Database
  let store: EvalRunStore

  const sampleInput = {
    runId: 'run_1',
    goldenId: 'gold_1',
    score: 0.95,
    passed: true,
    latencyMs: 150,
    modelUsed: 'sonnet',
    costUsd: 0.002,
  }

  beforeEach(() => {
    db = createDb()
    store = new EvalRunStore(db)
  })

  describe('record', () => {
    it('records an eval run and returns full entry', () => {
      createGolden(db, 'gold_1')
      const entry = store.record(sampleInput)
      expect(entry.id).toBeTruthy()
      expect(entry.id.startsWith('evalrun_')).toBe(true)
      expect(entry.runId).toBe('run_1')
      expect(entry.goldenId).toBe('gold_1')
      expect(entry.score).toBe(0.95)
      expect(entry.passed).toBe(true)
      expect(entry.latencyMs).toBe(150)
      expect(entry.modelUsed).toBe('sonnet')
      expect(entry.costUsd).toBe(0.002)
      expect(entry.createdAt).toBeTruthy()
    })

    it('defaults costUsd to 0 when not provided', () => {
      createGolden(db, 'gold_1')
      const entry = store.record({
        runId: 'run_1',
        goldenId: 'gold_1',
        score: 1,
        passed: true,
      })
      expect(entry.costUsd).toBe(0)
    })

    it('records failed eval run', () => {
      createGolden(db, 'gold_1')
      const entry = store.record({
        runId: 'run_1',
        goldenId: 'gold_1',
        score: 0.3,
        passed: false,
      })
      expect(entry.passed).toBe(false)
      const row = db.prepare('SELECT * FROM eval_run WHERE id = ?').get(entry.id) as Record<string, unknown>
      expect(row.passed).toBe(0)
    })
  })

  describe('listByRunId', () => {
    it('lists entries for a run ordered by created_at ASC', async () => {
      createGolden(db, 'g1')
      createGolden(db, 'g2')
      store.record({ ...sampleInput, goldenId: 'g1' })
      await new Promise((r) => setTimeout(r, 5))
      store.record({ ...sampleInput, goldenId: 'g2' })
      const entries = store.listByRunId('run_1')
      expect(entries).toHaveLength(2)
      expect(entries[0].goldenId).toBe('g1')
      expect(entries[1].goldenId).toBe('g2')
    })

    it('returns empty for unknown run', () => {
      expect(store.listByRunId('unknown')).toEqual([])
    })
  })

  describe('aggregate', () => {
    it('aggregates total, passed, passRate, totalCostUsd', () => {
      createGolden(db, 'g1')
      createGolden(db, 'g2')
      createGolden(db, 'g3')
      store.record({ runId: 'run_1', goldenId: 'g1', score: 1, passed: true, costUsd: 0.001 })
      store.record({ runId: 'run_1', goldenId: 'g2', score: 0, passed: false, costUsd: 0.002 })
      store.record({ runId: 'run_1', goldenId: 'g3', score: 0.8, passed: true, costUsd: 0.001 })
      const agg = store.aggregate('run_1')
      expect(agg.total).toBe(3)
      expect(agg.passed).toBe(2)
      expect(agg.passRate).toBeCloseTo(2 / 3)
      expect(agg.totalCostUsd).toBeCloseTo(0.004)
    })

    it('returns zeros for unknown run', () => {
      const agg = store.aggregate('unknown')
      expect(agg.total).toBe(0)
      expect(agg.passed).toBe(0)
      expect(agg.passRate).toBe(0)
      expect(agg.totalCostUsd).toBe(0)
    })
  })

  describe('recentByTool', () => {
    it('returns recent runs for a tool joined with eval_golden', () => {
      db.prepare(
        `INSERT INTO eval_golden (id, input, expected, scorer_kind, tool, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      ).run('gold_1', 'input', 'expected', 'exact_match', 'analyze')

      store.record({ runId: 'run_1', goldenId: 'gold_1', score: 1, passed: true })
      const recent = store.recentByTool('analyze', 10)
      expect(recent).toHaveLength(1)
      expect(recent[0].goldenId).toBe('gold_1')
    })

    it('returns empty when no golden matches the tool', () => {
      expect(store.recentByTool('unknown', 10)).toEqual([])
    })
  })

  describe('perModelStats', () => {
    it('returns per-model aggregates for a run', () => {
      createGolden(db, 'g1')
      createGolden(db, 'g2')
      createGolden(db, 'g3')
      store.record({ runId: 'run_1', goldenId: 'g1', score: 1, passed: true, modelUsed: 'sonnet', costUsd: 0.001 })
      store.record({ runId: 'run_1', goldenId: 'g2', score: 0, passed: false, modelUsed: 'sonnet', costUsd: 0.002 })
      store.record({ runId: 'run_1', goldenId: 'g3', score: 0.9, passed: true, modelUsed: 'haiku', costUsd: 0.0005 })
      const stats = store.perModelStats('run_1')
      expect(stats).toHaveLength(2)
      const sonnet = stats.find((s) => s.modelUsed === 'sonnet')
      expect(sonnet!.total).toBe(2)
      expect(sonnet!.passed).toBe(1)
      expect(sonnet!.passRate).toBe(0.5)
      expect(sonnet!.totalCostUsd).toBeCloseTo(0.003)
      const haiku = stats.find((s) => s.modelUsed === 'haiku')
      expect(haiku!.total).toBe(1)
      expect(haiku!.passRate).toBe(1)
    })

    it('uses <unknown> for null modelUsed', () => {
      createGolden(db, 'g1')
      store.record({ runId: 'run_1', goldenId: 'g1', score: 1, passed: true })
      const stats = store.perModelStats('run_1')
      expect(stats).toHaveLength(1)
      expect(stats[0].modelUsed).toBe('<unknown>')
    })
  })
})
