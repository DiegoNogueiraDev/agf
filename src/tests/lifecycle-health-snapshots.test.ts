/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { recordSnapshot, computeSuccessRate } from '../core/analyzer/lifecycle-health-snapshots.js'
import type { LifecycleHealthReport } from '../core/analyzer/prd-lifecycle-health.js'

// The production migration (v84) creates a unique index on COALESCE(epic_id, ''), taken_on
// so that NULL epic_id (project-wide) collapses to '' for uniqueness.
const MIGRATE_SQL = `
  CREATE TABLE IF NOT EXISTS lifecycle_health_snapshots (
    id TEXT PRIMARY KEY,
    epic_id TEXT,
    snapshot_json TEXT NOT NULL,
    passed_all INTEGER NOT NULL,
    taken_at TEXT NOT NULL,
    taken_on TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_lhs_unique
    ON lifecycle_health_snapshots(COALESCE(epic_id, ''), taken_on)
`

function makeReport(epicId: string | null, passedAll: boolean): LifecycleHealthReport {
  return {
    epicId: epicId ?? undefined,
    phases: {
      ANALYZE: { metric: 'ac_quality_score', value: 85, threshold: 70, passed: true },
      DESIGN: { metric: 'traceability_coverage', value: 1, threshold: 0.8, passed: true },
      PLAN: { metric: 'capacity_calibration_delta_pct', value: 0.05, threshold: 0.1, passed: true },
      IMPLEMENT: { metric: 'tdd_pass_rate', value: 1, threshold: 1.0, passed: true },
      VALIDATE: { metric: 'dod_grade_letter', value: 'B', threshold: 'B', passed: true },
      REVIEW: { metric: 'blast_radius_files', value: 3, threshold: 5, passed: true },
      HANDOFF: { metric: 'doc_completeness_gaps', value: 0, threshold: 0, passed: true },
      DEPLOY: { metric: 'harness_grade_letter', value: 'B', threshold: 'B', passed: passedAll },
      LISTENING: { metric: 'decision_outcome_closure_rate', value: 1, threshold: 1.0, passed: true },
    },
    passedCount: passedAll ? 9 : 8,
    passedAll,
    summary: passedAll ? '9/9 passed' : '8/9 passed',
  }
}

describe('lifecycle-health-snapshots', () => {
  let db: Database.Database

  beforeAll(() => {
    db = new Database(':memory:')
    db.exec(MIGRATE_SQL)
  })

  afterAll(() => {
    db.close()
  })

  describe('recordSnapshot', () => {
    it('stores a snapshot and returns it with id/timestamps', () => {
      const report = makeReport(null, true)
      const result = recordSnapshot(db, report, '2024-06-01T12:00:00.000Z')

      expect(result.id).toMatch(/^lhs_/)
      expect(result.epicId).toBeNull()
      expect(result.passedAll).toBe(true)
      expect(result.takenOn).toBe('2024-06-01')
    })

    it('last write wins on same day + epic', () => {
      const report1 = makeReport('epic-1', true)
      const report2 = makeReport('epic-1', false)

      const r1 = recordSnapshot(db, report1, '2024-06-15T10:00:00.000Z')
      const r2 = recordSnapshot(db, report2, '2024-06-15T12:00:00.000Z')

      // Same takenOn + epicId → r2 overwrites r1
      expect(r1.id).not.toBe(r2.id)
      expect(r1.takenOn).toBe(r2.takenOn)

      const rows = db
        .prepare(`SELECT passed_all FROM lifecycle_health_snapshots WHERE epic_id = ? ORDER BY taken_at DESC`)
        .all('epic-1') as Array<{ passed_all: number }>
      expect(rows[0].passed_all).toBe(0)
    })

    it('different epics on same day → separate rows', () => {
      const r1 = recordSnapshot(db, makeReport('epic-a', true), '2024-07-01T00:00:00.000Z')
      const r2 = recordSnapshot(db, makeReport('epic-b', true), '2024-07-01T00:00:00.000Z')
      expect(r1.id).not.toBe(r2.id)
    })
  })

  describe('computeSuccessRate', () => {
    it('no snapshots → successRate 0, summary mentions none', () => {
      const r = computeSuccessRate(db, { epicId: 'nonexistent' })
      expect(r.samples).toBe(0)
      expect(r.successRate).toBe(0)
      expect(r.latestPassedAll).toBeNull()
      expect(r.summary).toContain('no lifecycle-health snapshots')
    })

    it('all passing → 100% success rate', () => {
      recordSnapshot(db, makeReport('epic-pass', true), '2024-08-01T00:00:00.000Z')
      recordSnapshot(db, makeReport('epic-pass', true), '2024-08-02T00:00:00.000Z')
      recordSnapshot(db, makeReport('epic-pass', true), '2024-08-03T00:00:00.000Z')

      const r = computeSuccessRate(db, { epicId: 'epic-pass', window: 10 })
      expect(r.samples).toBe(3)
      expect(r.successRate).toBe(1)
      expect(r.latestPassedAll).toBe(true)
    })

    it('mixed pass/fail → fractional success rate', () => {
      recordSnapshot(db, makeReport('epic-mix', false), '2024-09-01T00:00:00.000Z')
      recordSnapshot(db, makeReport('epic-mix', true), '2024-09-02T00:00:00.000Z')
      recordSnapshot(db, makeReport('epic-mix', false), '2024-09-03T00:00:00.000Z')

      const r = computeSuccessRate(db, { epicId: 'epic-mix', window: 10 })
      expect(r.samples).toBe(3)
      expect(r.successRate).toBeCloseTo(1 / 3, 2)
      expect(r.latestPassedAll).toBe(false)
    })

    it('project-wide query aggregates all epics', () => {
      recordSnapshot(db, makeReport('epic-x', true), '2024-10-01T00:00:00.000Z')
      recordSnapshot(db, makeReport('epic-y', false), '2024-10-01T00:00:00.000Z')

      const r = computeSuccessRate(db, { window: 10 })
      expect(r.samples).toBeGreaterThan(2)
    })

    it('window limits returned samples', () => {
      const r = computeSuccessRate(db, { epicId: 'epic-pass', window: 2 })
      expect(r.samples).toBeLessThanOrEqual(2)
    })
  })
})
