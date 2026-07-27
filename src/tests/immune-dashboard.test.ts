/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_19bb36698561 AC coverage: Immune Dashboard CLI analytics
 *
 * AC1: Top antigen kinds by frequency and trend over time
 * AC2: Recovery success rate by antigen kind (weekly/cycle trend)
 * AC3: Cost of immune system operation (applied vs filtered)
 * AC4: Hottest nodes by danger signal density
 * AC5: Cost-benefit summary: patterns learned, auto-applied, estimated saved
 * AC6: Output as structured JSON (human-readable table is CLI concern)
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { getImmuneDashboard, type ImmuneDashboard } from '../core/skills/immune-dashboard.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

function createTestStore(): SqliteStore {
  const db = new Database(':memory:')
  runMigrations(db)
  return new SqliteStore(db)
}

let _seq = 0
function insertHealingLog(
  db: Database.Database,
  opts: {
    ts?: number
    issueType: string
    severity?: string
    actionType?: string
    nodeId?: string | null
    applied?: boolean
    success?: boolean
    projectId?: string
  },
): void {
  const id = `test_hl_${++_seq}`
  db.prepare(
    `INSERT INTO healing_log (id, project_id, ts, issue_type, severity, action_type, node_id, applied, success, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
  ).run(
    id,
    opts.projectId ?? 'default',
    opts.ts ?? Date.now(),
    opts.issueType,
    opts.severity ?? 'medium',
    opts.actionType ?? 'update_status',
    opts.nodeId ?? null,
    opts.applied ? 1 : 0,
    opts.success ? 1 : 0,
  )
}

function insertHealingPattern(
  db: Database.Database,
  opts: {
    fingerprint: string
    issueType?: string
    occurrenceCount?: number
    confidence?: number
    autoApplied?: boolean
    projectId?: string
  },
): void {
  db.prepare(
    `INSERT OR REPLACE INTO healing_patterns (fingerprint, project_id, issue_type, occurrence_count, confidence, last_seen_at, auto_applied)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.fingerprint,
    opts.projectId ?? 'default',
    opts.issueType ?? 'cycle_detected',
    opts.occurrenceCount ?? 1,
    opts.confidence ?? 0.5,
    Date.now(),
    opts.autoApplied ? 1 : 0,
  )
}

// ── AC1: Top antigen kinds by frequency ──────────────────────────────────────

describe('AC1: antigenFrequency — top issue types ranked by total count', () => {
  it('returns antigenFrequency sorted by count descending', () => {
    const store = createTestStore()
    const db = store.getDb()
    insertHealingLog(db, { issueType: 'cycle_detected' })
    insertHealingLog(db, { issueType: 'cycle_detected' })
    insertHealingLog(db, { issueType: 'cycle_detected' })
    insertHealingLog(db, { issueType: 'missing_ac' })
    insertHealingLog(db, { issueType: 'missing_ac' })
    insertHealingLog(db, { issueType: 'stuck_task' })

    const dashboard = getImmuneDashboard(store)
    expect(dashboard.antigenFrequency[0].issueType).toBe('cycle_detected')
    expect(dashboard.antigenFrequency[0].count).toBe(3)
    expect(dashboard.antigenFrequency[1].issueType).toBe('missing_ac')
    expect(dashboard.antigenFrequency[1].count).toBe(2)
    expect(dashboard.antigenFrequency[2].issueType).toBe('stuck_task')
    expect(dashboard.antigenFrequency[2].count).toBe(1)
    store.close()
  })

  it('returns empty array when no healing_log entries exist', () => {
    const store = createTestStore()
    const dashboard = getImmuneDashboard(store)
    expect(dashboard.antigenFrequency).toEqual([])
    store.close()
  })

  it('antigenFrequency entries have issueType and count fields', () => {
    const store = createTestStore()
    const db = store.getDb()
    insertHealingLog(db, { issueType: 'cycle_detected' })

    const dashboard = getImmuneDashboard(store)
    const entry = dashboard.antigenFrequency[0]
    expect(typeof entry.issueType).toBe('string')
    expect(typeof entry.count).toBe('number')
    store.close()
  })
})

// ── AC2: Recovery success rate by antigen kind ────────────────────────────────

describe('AC2: recoveryRates — success rate per issue type', () => {
  it('calculates rate as succeeded / total for each issue type', () => {
    const store = createTestStore()
    const db = store.getDb()
    // cycle_detected: 3 total, 2 success → rate 0.667
    insertHealingLog(db, { issueType: 'cycle_detected', success: true })
    insertHealingLog(db, { issueType: 'cycle_detected', success: true })
    insertHealingLog(db, { issueType: 'cycle_detected', success: false })
    // missing_ac: 2 total, 1 success → rate 0.5
    insertHealingLog(db, { issueType: 'missing_ac', success: true })
    insertHealingLog(db, { issueType: 'missing_ac', success: false })

    const dashboard = getImmuneDashboard(store)
    const cycle = dashboard.recoveryRates.find((r) => r.issueType === 'cycle_detected')
    const missing = dashboard.recoveryRates.find((r) => r.issueType === 'missing_ac')

    expect(cycle).toBeDefined()
    expect(cycle!.total).toBe(3)
    expect(cycle!.succeeded).toBe(2)
    expect(cycle!.rate).toBeCloseTo(2 / 3, 5)

    expect(missing).toBeDefined()
    expect(missing!.total).toBe(2)
    expect(missing!.succeeded).toBe(1)
    expect(missing!.rate).toBeCloseTo(0.5, 5)
    store.close()
  })

  it('rate is 0.0 when all entries failed', () => {
    const store = createTestStore()
    const db = store.getDb()
    insertHealingLog(db, { issueType: 'stuck_task', success: false })
    insertHealingLog(db, { issueType: 'stuck_task', success: false })

    const dashboard = getImmuneDashboard(store)
    const entry = dashboard.recoveryRates.find((r) => r.issueType === 'stuck_task')
    expect(entry!.rate).toBe(0)
    store.close()
  })

  it('rate is 1.0 when all entries succeeded', () => {
    const store = createTestStore()
    const db = store.getDb()
    insertHealingLog(db, { issueType: 'orphan_node', success: true })
    insertHealingLog(db, { issueType: 'orphan_node', success: true })

    const dashboard = getImmuneDashboard(store)
    const entry = dashboard.recoveryRates.find((r) => r.issueType === 'orphan_node')
    expect(entry!.rate).toBe(1)
    store.close()
  })
})

// ── AC3: Cost of immune system operation ─────────────────────────────────────

describe('AC3: operationCost — applied vs filtered count', () => {
  it('counts totalOperations, appliedCount, filteredCount', () => {
    const store = createTestStore()
    const db = store.getDb()
    insertHealingLog(db, { issueType: 'cycle_detected', applied: true })
    insertHealingLog(db, { issueType: 'cycle_detected', applied: true })
    insertHealingLog(db, { issueType: 'cycle_detected', applied: true })
    insertHealingLog(db, { issueType: 'missing_ac', applied: false })
    insertHealingLog(db, { issueType: 'missing_ac', applied: false })

    const { operationCost } = getImmuneDashboard(store)
    expect(operationCost.totalOperations).toBe(5)
    expect(operationCost.appliedCount).toBe(3)
    expect(operationCost.filteredCount).toBe(2)
    store.close()
  })

  it('counts autoAppliedPatterns from healing_patterns', () => {
    const store = createTestStore()
    const db = store.getDb()
    insertHealingPattern(db, { fingerprint: 'fp-auto-1', autoApplied: true })
    insertHealingPattern(db, { fingerprint: 'fp-auto-2', autoApplied: true })
    insertHealingPattern(db, { fingerprint: 'fp-not-auto', autoApplied: false })

    const { operationCost } = getImmuneDashboard(store)
    expect(operationCost.autoAppliedPatterns).toBe(2)
    store.close()
  })

  it('returns zero counts for empty store', () => {
    const store = createTestStore()
    const { operationCost } = getImmuneDashboard(store)
    expect(operationCost.totalOperations).toBe(0)
    expect(operationCost.appliedCount).toBe(0)
    expect(operationCost.filteredCount).toBe(0)
    expect(operationCost.autoAppliedPatterns).toBe(0)
    store.close()
  })
})

// ── AC4: Hottest nodes by danger signal density ───────────────────────────────

describe('AC4: hottestNodes — nodes with most healing events', () => {
  it('returns nodes sorted by signalCount descending', () => {
    const store = createTestStore()
    const db = store.getDb()
    insertHealingLog(db, { issueType: 'cycle_detected', nodeId: 'node-A' })
    insertHealingLog(db, { issueType: 'cycle_detected', nodeId: 'node-A' })
    insertHealingLog(db, { issueType: 'cycle_detected', nodeId: 'node-A' })
    insertHealingLog(db, { issueType: 'missing_ac', nodeId: 'node-B' })
    insertHealingLog(db, { issueType: 'stuck_task', nodeId: null })

    const { hottestNodes } = getImmuneDashboard(store)
    expect(hottestNodes[0].nodeId).toBe('node-A')
    expect(hottestNodes[0].signalCount).toBe(3)
    expect(hottestNodes[1].nodeId).toBe('node-B')
    expect(hottestNodes[1].signalCount).toBe(1)
    // null nodeId entries excluded
    expect(hottestNodes.every((n) => n.nodeId !== null)).toBe(true)
    store.close()
  })

  it('returns empty array when no entries have non-null nodeId', () => {
    const store = createTestStore()
    const db = store.getDb()
    insertHealingLog(db, { issueType: 'cycle_detected', nodeId: null })

    const { hottestNodes } = getImmuneDashboard(store)
    expect(hottestNodes).toEqual([])
    store.close()
  })
})

// ── AC5: Cost-benefit summary ─────────────────────────────────────────────────

describe('AC5: costBenefit — patterns learned and auto-applied', () => {
  it('counts patternsLearned from healing_patterns', () => {
    const store = createTestStore()
    const db = store.getDb()
    insertHealingPattern(db, { fingerprint: 'fp-1' })
    insertHealingPattern(db, { fingerprint: 'fp-2' })
    insertHealingPattern(db, { fingerprint: 'fp-3' })

    const { costBenefit } = getImmuneDashboard(store)
    expect(costBenefit.patternsLearned).toBe(3)
    store.close()
  })

  it('autoApplied counts patterns with auto_applied=1', () => {
    const store = createTestStore()
    const db = store.getDb()
    insertHealingPattern(db, { fingerprint: 'fp-a1', autoApplied: true })
    insertHealingPattern(db, { fingerprint: 'fp-a2', autoApplied: true })
    insertHealingPattern(db, { fingerprint: 'fp-na', autoApplied: false })

    const { costBenefit } = getImmuneDashboard(store)
    expect(costBenefit.autoApplied).toBe(2)
    store.close()
  })

  it('estimatedManualSaved equals autoApplied', () => {
    const store = createTestStore()
    const db = store.getDb()
    insertHealingPattern(db, { fingerprint: 'fp-x', autoApplied: true })

    const { costBenefit } = getImmuneDashboard(store)
    expect(costBenefit.estimatedManualSaved).toBe(costBenefit.autoApplied)
    store.close()
  })
})

// ── AC6: Structured JSON output ───────────────────────────────────────────────

describe('AC6: structured output — ImmuneDashboard shape', () => {
  it('dashboard has all required top-level fields', () => {
    const store = createTestStore()
    const dashboard = getImmuneDashboard(store)

    expect(dashboard).toHaveProperty('antigenFrequency')
    expect(dashboard).toHaveProperty('recoveryRates')
    expect(dashboard).toHaveProperty('operationCost')
    expect(dashboard).toHaveProperty('hottestNodes')
    expect(dashboard).toHaveProperty('costBenefit')
    store.close()
  })

  it('dashboard is JSON-serializable (no circular references)', () => {
    const store = createTestStore()
    const dashboard = getImmuneDashboard(store)

    expect(() => JSON.stringify(dashboard)).not.toThrow()
    const parsed = JSON.parse(JSON.stringify(dashboard)) as ImmuneDashboard
    expect(parsed).toHaveProperty('antigenFrequency')
    store.close()
  })

  it('operationCost has totalOperations, appliedCount, filteredCount, autoAppliedPatterns', () => {
    const store = createTestStore()
    const { operationCost } = getImmuneDashboard(store)

    expect(typeof operationCost.totalOperations).toBe('number')
    expect(typeof operationCost.appliedCount).toBe('number')
    expect(typeof operationCost.filteredCount).toBe('number')
    expect(typeof operationCost.autoAppliedPatterns).toBe('number')
    store.close()
  })
})
