/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { getEvolutionReport } from '../core/harness/harness-evolution.js'

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

function seed(db: Database.Database, scores: number[], projectId = 'proj_local') {
  const insert = db.prepare(
    'INSERT INTO harness_history (id, project_id, score, grade, timestamp) VALUES (?, ?, ?, ?, ?)',
  )
  scores.forEach((score, i) => {
    const ts = new Date(Date.UTC(2026, 0, 1 + i)).toISOString()
    insert.run(`${projectId}-id-${i}`, projectId, score, score >= 85 ? 'A' : score >= 70 ? 'B' : 'C', ts)
  })
}

describe('getEvolutionReport', () => {
  it('returns null when fewer than 2 records exist', () => {
    const db = createDb()
    seed(db, [50])
    expect(getEvolutionReport(db)).toBeNull()
  })

  it('returns null for empty history', () => {
    const db = createDb()
    expect(getEvolutionReport(db)).toBeNull()
  })

  it('returns improving when delta > 2', () => {
    const db = createDb()
    seed(db, [50, 55, 60, 70])
    const result = getEvolutionReport(db, 'proj_local')
    expect(result).not.toBeNull()
    expect(result!.direction).toBe('improving')
    expect(result!.delta).toBeGreaterThan(2)
  })

  it('returns declining when delta < -2', () => {
    const db = createDb()
    seed(db, [80, 75, 70, 60])
    const result = getEvolutionReport(db, 'proj_local')
    expect(result!.direction).toBe('declining')
    expect(result!.delta).toBeLessThan(-2)
  })

  it('returns stable when delta is within [-2, 2]', () => {
    const db = createDb()
    seed(db, [70, 71, 70, 69])
    const result = getEvolutionReport(db, 'proj_local')
    expect(result!.direction).toBe('stable')
  })

  it('compares earliest and latest scores correctly', () => {
    const db = createDb()
    seed(db, [30, 40, 50, 60])
    const result = getEvolutionReport(db, 'proj_local')
    expect(result!.earliest.score).toBe(30)
    expect(result!.latest.score).toBe(60)
    expect(result!.delta).toBe(30)
  })

  it('supports scoping by projectId', () => {
    const db = createDb()
    seed(db, [10, 20], 'project_a')
    seed(db, [90, 91], 'project_b')
    const resultA = getEvolutionReport(db, 'project_a')
    const resultB = getEvolutionReport(db, 'project_b')
    expect(resultA!.direction).toBe('improving')
    expect(resultB!.direction).toBe('stable')
  })
})
