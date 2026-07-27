/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 1.5 AC coverage: immune-ledger confidence thresholds
 *
 * AC1: pattern never seen → confidence = 0.0
 * AC2: pattern seen 1x   → confidence = 0.5 (propose only)
 * AC3: pattern seen 2x   → confidence = 0.6 (propose)
 * AC4: pattern seen 3x+  → confidence >= 0.9 (auto-apply)
 * AC5: insertImmuneCycle + queryImmuneSummary round-trip
 * AC6: listImmuneCycles + queryImmuneDashboard basic coverage
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations.js'
import {
  insertImmuneCycle,
  queryImmuneSummary,
  listImmuneCycles,
  queryImmuneDashboard,
  getPatternConfidence,
} from '../core/immune/immune-ledger.js'
import type { ImmuneLedgerEntry } from '../core/immune/immune-types.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROJECT_ID = 'test-project'
let db: Database.Database

function freshDb(): Database.Database {
  const d = new Database(':memory:')
  runMigrations(d)
  return d
}

function seedMemory(d: Database.Database, signature: string, occurrences: number): void {
  d.prepare(
    `INSERT INTO immune_memory (project_id, signature, antigen_kind, file, first_seen, last_seen, occurrences, last_action, recovery_success, suppressed)
     VALUES (?, ?, 'lint_error', 'src/foo.ts', 1000, 2000, ?, NULL, 0, 0)
     ON CONFLICT(project_id, signature) DO UPDATE SET occurrences = excluded.occurrences`,
  ).run(PROJECT_ID, signature, occurrences)
}

function makeEntry(override: Partial<ImmuneLedgerEntry> = {}): ImmuneLedgerEntry {
  return {
    id: `cycle-${Math.random().toString(36).slice(2)}`,
    cycleId: 'c1',
    signalsDetected: 3,
    antigensPresented: 2,
    responsesGenerated: 1,
    responsesApplied: 1,
    responsesGated: 0,
    responsesFailedVerify: 0,
    recoveryRate: 1.0,
    gatePassRate: 1.0,
    verificationPassRate: 1.0,
    estimatedTokensSaved: 100,
    estimatedTokensSpent: 20,
    durationMs: 500,
    createdAt: Date.now(),
    ...override,
  }
}

beforeEach(() => {
  db = freshDb()
})

// ── AC1: pattern never seen → confidence = 0.0 ───────────────────────────────

describe('getPatternConfidence — AC1: unseen pattern', () => {
  it('returns 0.0 for a signature not in immune_memory', () => {
    const confidence = getPatternConfidence(db, PROJECT_ID, 'unknown-signature')
    expect(confidence).toBe(0.0)
  })

  it('returns 0.0 for a signature from a different project', () => {
    seedMemory(db, 'sig-a', 3)
    const confidence = getPatternConfidence(db, 'other-project', 'sig-a')
    expect(confidence).toBe(0.0)
  })
})

// ── AC2: pattern seen 1x → confidence = 0.5 ─────────────────────────────────

describe('getPatternConfidence — AC2: first exposure', () => {
  it('returns 0.5 when pattern has occurrences = 1', () => {
    seedMemory(db, 'sig-first', 1)
    const confidence = getPatternConfidence(db, PROJECT_ID, 'sig-first')
    expect(confidence).toBe(0.5)
  })
})

// ── AC3: pattern seen 2x → confidence = 0.6 ─────────────────────────────────

describe('getPatternConfidence — AC3: second exposure', () => {
  it('returns 0.6 when pattern has occurrences = 2', () => {
    seedMemory(db, 'sig-second', 2)
    const confidence = getPatternConfidence(db, PROJECT_ID, 'sig-second')
    expect(confidence).toBe(0.6)
  })
})

// ── AC4: pattern seen 3x+ → confidence >= 0.9 ────────────────────────────────

describe('getPatternConfidence — AC4: auto-apply threshold', () => {
  it('returns >= 0.9 when occurrences = 3', () => {
    seedMemory(db, 'sig-auto', 3)
    const confidence = getPatternConfidence(db, PROJECT_ID, 'sig-auto')
    expect(confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('returns >= 0.9 when occurrences = 10', () => {
    seedMemory(db, 'sig-veteran', 10)
    const confidence = getPatternConfidence(db, PROJECT_ID, 'sig-veteran')
    expect(confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('returns exactly 0.9 for occurrences = 3 (boundary)', () => {
    seedMemory(db, 'sig-boundary', 3)
    const confidence = getPatternConfidence(db, PROJECT_ID, 'sig-boundary')
    expect(confidence).toBe(0.9)
  })
})

// ── AC5: insertImmuneCycle + queryImmuneSummary round-trip ───────────────────

describe('AC5: insertImmuneCycle + queryImmuneSummary', () => {
  it('inserts a cycle and queries the summary', () => {
    insertImmuneCycle(db, PROJECT_ID, makeEntry({ signalsDetected: 5, responsesApplied: 3, recoveryRate: 0.8 }))
    const summary = queryImmuneSummary(db, PROJECT_ID)
    expect(summary.totalCycles).toBe(1)
    expect(summary.totalSignals).toBe(5)
    expect(summary.totalApplied).toBe(3)
    expect(summary.averageRecoveryRate).toBeCloseTo(0.8)
  })

  it('aggregates multiple cycles', () => {
    insertImmuneCycle(db, PROJECT_ID, makeEntry({ signalsDetected: 2 }))
    insertImmuneCycle(db, PROJECT_ID, makeEntry({ signalsDetected: 4 }))
    const summary = queryImmuneSummary(db, PROJECT_ID)
    expect(summary.totalCycles).toBe(2)
    expect(summary.totalSignals).toBe(6)
  })

  it('returns zero summary for empty ledger', () => {
    const summary = queryImmuneSummary(db, PROJECT_ID)
    expect(summary.totalCycles).toBe(0)
    expect(summary.totalSignals).toBe(0)
    expect(summary.lastCycleAt).toBeNull()
  })

  it('returns zero summary when project has no cycles', () => {
    insertImmuneCycle(db, 'other-project', makeEntry())
    const summary = queryImmuneSummary(db, PROJECT_ID)
    expect(summary.totalCycles).toBe(0)
  })
})

// ── AC6: listImmuneCycles + queryImmuneDashboard ──────────────────────────────

describe('AC6: listImmuneCycles + queryImmuneDashboard', () => {
  it('listImmuneCycles returns all cycles (reverse chronological via ORDER BY created_at DESC)', () => {
    insertImmuneCycle(db, PROJECT_ID, makeEntry({ cycleId: 'c1', createdAt: 1000 }))
    insertImmuneCycle(db, PROJECT_ID, makeEntry({ cycleId: 'c2', createdAt: 2000 }))
    const cycles = listImmuneCycles(db, PROJECT_ID)
    expect(cycles).toHaveLength(2)
    // Raw rows use snake_case (listImmuneCycles casts to type but doesn't map columns)
    const raw = cycles as unknown as Array<Record<string, number>>
    expect(raw[0].created_at).toBeGreaterThan(raw[1].created_at)
  })

  it('listImmuneCycles respects the limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      insertImmuneCycle(db, PROJECT_ID, makeEntry())
    }
    const cycles = listImmuneCycles(db, PROJECT_ID, 3)
    expect(cycles).toHaveLength(3)
  })

  it('listImmuneCycles returns empty array for fresh database', () => {
    expect(listImmuneCycles(db, PROJECT_ID)).toEqual([])
  })

  it('queryImmuneDashboard returns valid structure with no data', () => {
    const dashboard = queryImmuneDashboard(db, PROJECT_ID)
    expect(dashboard.totalCycles).toBe(0)
    expect(dashboard.trendByCycle).toEqual([])
    expect(dashboard.topAntigenKinds).toEqual([])
    expect(dashboard.costBenefitSummary.netTokenBenefit).toBe(0)
  })

  it('queryImmuneDashboard reflects cycle data', () => {
    insertImmuneCycle(
      db,
      PROJECT_ID,
      makeEntry({ signalsDetected: 10, estimatedTokensSaved: 200, estimatedTokensSpent: 50 }),
    )
    const dashboard = queryImmuneDashboard(db, PROJECT_ID)
    expect(dashboard.totalSignals).toBe(10)
    expect(dashboard.costBenefitSummary.estimatedTokensSaved).toBe(200)
    expect(dashboard.costBenefitSummary.netTokenBenefit).toBe(150)
  })
})
