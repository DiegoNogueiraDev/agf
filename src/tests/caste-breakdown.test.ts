/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/learning/caste-breakdown.ts — aggregateCasteBreakdown.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { aggregateCasteBreakdown } from '../core/learning/caste-breakdown.js'

function dbWithPerf(): Database.Database {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE perf_records (project_id TEXT, caste TEXT, ac_passed INTEGER, cycle_time_ms INTEGER)')
  const ins = db.prepare('INSERT INTO perf_records (project_id, caste, ac_passed, cycle_time_ms) VALUES (?, ?, ?, ?)')
  ins.run('p1', 'worker', 1, 100)
  ins.run('p1', 'worker', 0, 300)
  ins.run('p1', 'scout', 1, 50)
  return db
}

describe('aggregateCasteBreakdown', () => {
  it('returns [] when the perf_records table is absent (error-safe)', () => {
    const db = new Database(':memory:')
    expect(aggregateCasteBreakdown(db, 'p1')).toEqual([])
  })

  it('computes accuracy and failure_rate per caste, ordered by record_count desc', () => {
    const db = dbWithPerf()
    const rows = aggregateCasteBreakdown(db, 'p1')

    expect(rows.map((r) => r.caste)).toEqual(['worker', 'scout'])
    const worker = rows[0]
    expect(worker.record_count).toBe(2)
    expect(worker.accuracy).toBeCloseTo(0.5)
    expect(worker.failure_rate).toBeCloseTo(0.5)
    expect(worker.avg_cycle_time_ms).toBeCloseTo(200)

    const scout = rows[1]
    expect(scout.accuracy).toBe(1)
    expect(scout.failure_rate).toBe(0)
  })

  it('returns [] for a project with no records', () => {
    const db = dbWithPerf()
    expect(aggregateCasteBreakdown(db, 'unknown-project')).toEqual([])
  })
})
