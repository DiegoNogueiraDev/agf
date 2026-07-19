/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { getTrends, predictGradeTarget, readRecentHarnessBreakdowns } from '../core/harness/harness-trends.js'

function makeDb(rows: Array<{ score: number }>) {
  return {
    prepare: () => ({
      all: () => rows,
      get: () => rows[rows.length - 1],
    }),
  } as any
}

describe('Harness Trends', () => {
  it('returns unknown for empty history', () => {
    const db = makeDb([])
    const result = getTrends(db)
    expect(result.direction).toBe('unknown')
    expect(result.dataPoints).toBe(0)
  })

  it('detects improving trend', () => {
    const db = makeDb([{ score: 50 }, { score: 60 }, { score: 70 }, { score: 80 }])
    const result = getTrends(db)
    expect(result.direction).toBe('improving')
    expect(result.slope).toBeGreaterThan(0)
  })

  it('detects declining trend', () => {
    const db = makeDb([{ score: 80 }, { score: 70 }, { score: 60 }, { score: 50 }])
    const result = getTrends(db)
    expect(result.direction).toBe('declining')
    expect(result.slope).toBeLessThan(0)
  })

  it('detects stable trend', () => {
    const db = makeDb([{ score: 70 }, { score: 71 }, { score: 69 }, { score: 70 }])
    const result = getTrends(db)
    expect(result.direction).toBe('stable')
  })

  it('predicts scans needed for target grade', () => {
    const db = makeDb([{ score: 60 }, { score: 65 }, { score: 70 }])
    const prediction = predictGradeTarget(db, 'A')
    expect(prediction).not.toBeNull()
    expect(prediction!.targetGrade).toBe('A')
    expect(prediction!.scansNeeded).toBeGreaterThan(0)
  })

  it('predictGradeTarget returns null when already at target', () => {
    const db = makeDb([{ score: 90 }])
    expect(predictGradeTarget(db, 'A')).toBeNull()
  })
})

describe('readRecentHarnessBreakdowns', () => {
  function seedDb(): InstanceType<typeof Database> {
    const db = new Database(':memory:')
    db.exec(`
      CREATE TABLE harness_history (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, score REAL NOT NULL,
        grade TEXT NOT NULL, breakdown TEXT NOT NULL, git_commit TEXT, timestamp TEXT NOT NULL
      );
    `)
    const ins = db.prepare(
      'INSERT INTO harness_history (id, project_id, score, grade, breakdown, git_commit, timestamp) VALUES (?,?,?,?,?,?,?)',
    )
    ins.run('a', 'proj_local', 80, 'B', '{"types":{"score":80}}', null, '2026-01-01T00:00:00.000Z')
    ins.run('b', 'proj_local', 90, 'A', '{"types":{"score":90}}', null, '2026-01-02T00:00:00.000Z')
    ins.run('c', 'proj_local', 95, 'A', '{"types":{"score":95}}', null, '2026-01-03T00:00:00.000Z')
    return db
  }

  it('returns the most recent n rows newest-first with breakdown JSON', () => {
    const db = seedDb()
    const rows = readRecentHarnessBreakdowns(db, 'proj_local', 2)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.score).toBe(95) // newest first
    expect(rows[1]!.score).toBe(90)
    expect(JSON.parse(rows[0]!.breakdown).types.score).toBe(95)
    db.close()
  })

  it('returns empty array when no history exists for the project', () => {
    const db = seedDb()
    expect(readRecentHarnessBreakdowns(db, 'other_project', 2)).toHaveLength(0)
    db.close()
  })
})
