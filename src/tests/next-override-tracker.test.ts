/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/planner/next-override-tracker.ts — recordNextOverride + analyzeNextPolicyAudit.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { recordNextOverride, analyzeNextPolicyAudit } from '../core/planner/next-override-tracker.js'

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE next_overrides (
    id TEXT PRIMARY KEY, project_id TEXT, suggestion_id TEXT, actual_id TEXT,
    suggestion_priority INTEGER, actual_priority INTEGER,
    suggestion_tags TEXT, actual_tags TEXT, timestamp TEXT
  )`)
  return db
}

describe('next-override-tracker', () => {
  it('reports healthy with 0 overrides when the table is missing (error-safe)', () => {
    const db = new Database(':memory:')
    expect(analyzeNextPolicyAudit(db, 'p1')).toEqual({ status: 'healthy', overrides: 0 })
  })

  it('records overrides and counts them in the audit', () => {
    const db = freshDb()
    recordNextOverride(db, {
      projectId: 'p1',
      suggestionId: 's1',
      actualId: 'a1',
      timestamp: '2026-06-24T00:00:00Z',
    })
    const report = analyzeNextPolicyAudit(db, 'p1')
    expect(report.overrides).toBe(1)
  })

  it('surfaces a priority-override pattern once the threshold is exceeded', () => {
    const db = freshDb()
    for (let i = 0; i < 5; i++) {
      recordNextOverride(db, {
        projectId: 'p1',
        suggestionId: `s${i}`,
        actualId: `a${i}`,
        suggestionPriority: 1,
        actualPriority: 3,
        suggestionTags: ['test'],
        timestamp: '2026-06-24T00:00:00Z',
      })
    }
    const report = analyzeNextPolicyAudit(db, 'p1')
    expect(report.overrides).toBe(5)
    expect(report.patterns && report.patterns.length).toBeGreaterThanOrEqual(1)
  })
})
