/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import {
  getHarnessPreflightWarning,
  checkHarnessRegressionGate,
  getHarnessRegressionReport,
} from '../core/harness/harness-preflight.js'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE harness_history (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT 'proj_local',
      score REAL NOT NULL,
      grade TEXT NOT NULL,
      breakdown TEXT,
      git_commit TEXT,
      timestamp TEXT NOT NULL
    )
  `)
  return db
}

describe('getHarnessPreflightWarning', () => {
  it('returns null when no history exists', () => {
    const db = createDb()
    expect(getHarnessPreflightWarning(db)).toBeNull()
  })

  it('returns null when score >= 70', () => {
    const db = createDb()
    db.prepare(
      "INSERT INTO harness_history (id, project_id, score, grade, timestamp) VALUES ('a', 'proj_local', 85, 'A', ?)",
    ).run(new Date().toISOString())
    expect(getHarnessPreflightWarning(db)).toBeNull()
  })

  it('returns warning for score between 55 and 70', () => {
    const db = createDb()
    db.prepare(
      "INSERT INTO harness_history (id, project_id, score, grade, timestamp) VALUES ('a', 'proj_local', 60, 'C', ?)",
    ).run(new Date().toISOString())
    const warning = getHarnessPreflightWarning(db)
    expect(warning).not.toBeNull()
    expect(warning!.score).toBe(60)
    expect(warning!.message).toContain('Moderate quality gap')
  })

  it('returns warning for score below 55', () => {
    const db = createDb()
    db.prepare(
      "INSERT INTO harness_history (id, project_id, score, grade, timestamp) VALUES ('a', 'proj_local', 40, 'D', ?)",
    ).run(new Date().toISOString())
    const warning = getHarnessPreflightWarning(db)
    expect(warning).not.toBeNull()
    expect(warning!.message).toContain('High hallucination risk')
  })
})

describe('checkHarnessRegressionGate', () => {
  it('does not block when delta is within threshold', () => {
    const result = checkHarnessRegressionGate(80, 78, 'strict', 5)
    expect(result.blocked).toBe(false)
    expect(result.delta).toBe(-2)
  })

  it('blocks in strict mode when drop exceeds threshold', () => {
    const result = checkHarnessRegressionGate(80, 70, 'strict', 5)
    expect(result.blocked).toBe(true)
    expect(result.delta).toBe(-10)
  })

  it('does not block in advisory mode when drop exceeds threshold', () => {
    const result = checkHarnessRegressionGate(80, 70, 'advisory', 5)
    expect(result.blocked).toBe(false)
    expect(result.delta).toBe(-10)
  })

  it('skips entirely when mode is off', () => {
    const result = checkHarnessRegressionGate(80, 40, 'off', 5)
    expect(result.blocked).toBe(false)
    expect(result.mode).toBe('off')
  })

  it('accepts override reason to unblock', () => {
    const result = checkHarnessRegressionGate(80, 70, 'strict', 5, 'Intentional refactor')
    expect(result.blocked).toBe(false)
    expect(result.overrideReason).toBe('Intentional refactor')
  })

  it('does not block when drop equals threshold exactly', () => {
    const result = checkHarnessRegressionGate(80, 75, 'strict', 5)
    expect(result.blocked).toBe(false)
    expect(result.delta).toBe(-5)
  })

  it('does not block when score improves', () => {
    const result = checkHarnessRegressionGate(70, 80, 'strict', 5)
    expect(result.blocked).toBe(false)
    expect(result.delta).toBe(10)
  })
})

describe('getHarnessRegressionReport', () => {
  it('returns null with fewer than 2 history rows', () => {
    const db = createDb()
    db.prepare(
      "INSERT INTO harness_history (id, project_id, score, grade, timestamp) VALUES ('a', 'proj_local', 80, 'A', ?)",
    ).run(new Date().toISOString())
    expect(getHarnessRegressionReport(db, 75)).toBeNull()
  })

  it('returns null when score drop is within 5 points', () => {
    const db = createDb()
    const ts = new Date().toISOString()
    db.prepare(
      "INSERT INTO harness_history (id, project_id, score, grade, timestamp) VALUES ('a', 'proj_local', 80, 'A', ?)",
    ).run(ts)
    db.prepare(
      "INSERT INTO harness_history (id, project_id, score, grade, timestamp) VALUES ('b', 'proj_local', 82, 'A', ?)",
    ).run(new Date(Date.now() + 1000).toISOString())
    expect(getHarnessRegressionReport(db, 78)).toBeNull()
  })

  it('returns report when drop exceeds 5 points', () => {
    const db = createDb()
    const ts = new Date().toISOString()
    db.prepare(
      "INSERT INTO harness_history (id, project_id, score, grade, timestamp) VALUES ('a', 'proj_local', 80, 'A', ?)",
    ).run(ts)
    db.prepare(
      "INSERT INTO harness_history (id, project_id, score, grade, timestamp) VALUES ('b', 'proj_local', 80, 'A', ?)",
    ).run(new Date(Date.now() + 1000).toISOString())
    const report = getHarnessRegressionReport(db, 70)
    expect(report).not.toBeNull()
    expect(report!.before).toBe(80)
    expect(report!.after).toBe(70)
    expect(report!.delta).toBe(-10)
  })
})
