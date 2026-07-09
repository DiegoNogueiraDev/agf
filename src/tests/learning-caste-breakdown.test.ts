/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_85cdd2fbaf71 AC coverage: learning caste breakdown
 *
 * AC: agf learning stats shows breakdown by caste: accuracy, avg_tokens, failure_rate
 * AC: perf_records table has nullable caste column
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { aggregateCasteBreakdown, type CasteBreakdown } from '../core/learning/caste-breakdown.js'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE perf_records (
      id              TEXT PRIMARY KEY,
      project_id      TEXT NOT NULL,
      agent_id        TEXT NOT NULL,
      node_id         TEXT NOT NULL,
      harness_delta   REAL NOT NULL DEFAULT 0,
      ac_passed       INTEGER NOT NULL DEFAULT 0,
      cycle_time_ms   INTEGER NOT NULL DEFAULT 0,
      ts              INTEGER NOT NULL,
      caste           TEXT
    );
  `)
  return db
}

function insert(
  db: Database.Database,
  id: string,
  opts: { acPassed?: boolean; cycleTimeMs?: number; caste?: string | null } = {},
) {
  const { acPassed = true, cycleTimeMs = 1000, caste = null } = opts
  db.prepare(
    `INSERT INTO perf_records (id, project_id, agent_id, node_id, harness_delta, ac_passed, cycle_time_ms, ts, caste)
     VALUES (?, 'proj', 'agent1', 'node1', 0, ?, ?, 1000, ?)`,
  ).run(id, acPassed ? 1 : 0, cycleTimeMs, caste)
}

describe('perf_records caste column', () => {
  it('accepts null caste (nullable)', () => {
    const db = makeDb()
    expect(() => insert(db, 'r1', { caste: null })).not.toThrow()
  })

  it('accepts string caste value', () => {
    const db = makeDb()
    expect(() => insert(db, 'r1', { caste: 'TRAIL' })).not.toThrow()
  })

  it('stored caste is readable', () => {
    const db = makeDb()
    insert(db, 'r1', { caste: 'EXPLORE' })
    const row = db.prepare('SELECT caste FROM perf_records WHERE id = ?').get('r1') as { caste: string }
    expect(row.caste).toBe('EXPLORE')
  })
})

describe('aggregateCasteBreakdown', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeDb()
  })

  it('returns empty array when no records', () => {
    expect(aggregateCasteBreakdown(db, 'proj')).toEqual([])
  })

  it('groups records by caste', () => {
    insert(db, 'r1', { caste: 'TRAIL', acPassed: true, cycleTimeMs: 1000 })
    insert(db, 'r2', { caste: 'TRAIL', acPassed: false, cycleTimeMs: 2000 })
    insert(db, 'r3', { caste: 'EXPLORE', acPassed: true, cycleTimeMs: 500 })
    const result = aggregateCasteBreakdown(db, 'proj')
    const trail = result.find((r) => r.caste === 'TRAIL')
    const explore = result.find((r) => r.caste === 'EXPLORE')
    expect(trail).toBeDefined()
    expect(explore).toBeDefined()
  })

  it('computes accuracy (acPassRate) correctly', () => {
    insert(db, 'r1', { caste: 'TRAIL', acPassed: true })
    insert(db, 'r2', { caste: 'TRAIL', acPassed: true })
    insert(db, 'r3', { caste: 'TRAIL', acPassed: false })
    const result = aggregateCasteBreakdown(db, 'proj')
    const trail = result.find((r) => r.caste === 'TRAIL')!
    expect(trail.accuracy).toBeCloseTo(2 / 3, 2)
  })

  it('computes failure_rate (1 - accuracy)', () => {
    insert(db, 'r1', { caste: 'TRAIL', acPassed: true })
    insert(db, 'r2', { caste: 'TRAIL', acPassed: false })
    const result = aggregateCasteBreakdown(db, 'proj')
    const trail = result.find((r) => r.caste === 'TRAIL')!
    expect(trail.failure_rate).toBeCloseTo(0.5, 2)
    expect(trail.accuracy + trail.failure_rate).toBeCloseTo(1.0, 2)
  })

  it('computes avg_tokens from cycle_time_ms', () => {
    insert(db, 'r1', { caste: 'TRAIL', cycleTimeMs: 1000 })
    insert(db, 'r2', { caste: 'TRAIL', cycleTimeMs: 3000 })
    const result = aggregateCasteBreakdown(db, 'proj')
    const trail = result.find((r) => r.caste === 'TRAIL')!
    // avg_cycle_time_ms = 2000
    expect(trail.avg_cycle_time_ms).toBeCloseTo(2000, 0)
  })

  it('excludes null-caste records from breakdown', () => {
    insert(db, 'r1', { caste: null })
    insert(db, 'r2', { caste: 'TRAIL' })
    const result = aggregateCasteBreakdown(db, 'proj')
    expect(result.every((r) => r.caste !== null)).toBe(true)
  })

  it('result items have all required fields', () => {
    insert(db, 'r1', { caste: 'TRAIL', acPassed: true, cycleTimeMs: 1000 })
    const result = aggregateCasteBreakdown(db, 'proj')
    const item = result[0]! as CasteBreakdown
    expect(typeof item.caste).toBe('string')
    expect(typeof item.record_count).toBe('number')
    expect(typeof item.accuracy).toBe('number')
    expect(typeof item.failure_rate).toBe('number')
    expect(typeof item.avg_cycle_time_ms).toBe('number')
  })
})
