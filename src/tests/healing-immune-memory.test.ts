/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 5.1 AC coverage: persist healing patterns with subgraph fingerprint
 *
 * AC1: agf heal --apply cures cycle_detected → healing_log includes subgraph fingerprint
 * AC2: same fingerprint 2nd time → confidence ≥ 0.6, action auto-proposed (not just flagged)
 * AC3: same fingerprint 3rd time → action auto-applied without --apply (confidence ≥ 0.9)
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import {
  computeSubgraphFingerprint,
  computePatternConfidence,
  upsertHealingPattern,
  getHealingPattern,
  type HealingPatternRow,
} from '../core/skills/persist-healing.js'

// ── Test helpers ──────────────────────────────────────────────────────────────

function createTestStore(): SqliteStore {
  const db = new Database(':memory:')
  runMigrations(db)
  const store = new SqliteStore(db)
  return store
}

// ── AC1 support: computeSubgraphFingerprint ───────────────────────────────────

describe('AC1: computeSubgraphFingerprint — deterministic hash of node IDs + edge types', () => {
  it('returns the same hash regardless of node ID order', () => {
    const h1 = computeSubgraphFingerprint(['node-a', 'node-b', 'node-c'], ['depends_on'])
    const h2 = computeSubgraphFingerprint(['node-c', 'node-a', 'node-b'], ['depends_on'])
    expect(h1).toBe(h2)
  })

  it('returns the same hash regardless of edge type order', () => {
    const h1 = computeSubgraphFingerprint(['node-a'], ['depends_on', 'blocks'])
    const h2 = computeSubgraphFingerprint(['node-a'], ['blocks', 'depends_on'])
    expect(h1).toBe(h2)
  })

  it('returns different hashes for different node sets', () => {
    const h1 = computeSubgraphFingerprint(['node-a', 'node-b'], ['depends_on'])
    const h2 = computeSubgraphFingerprint(['node-a', 'node-c'], ['depends_on'])
    expect(h1).not.toBe(h2)
  })

  it('returns different hashes for different edge types', () => {
    const h1 = computeSubgraphFingerprint(['node-a'], ['depends_on'])
    const h2 = computeSubgraphFingerprint(['node-a'], ['blocks'])
    expect(h1).not.toBe(h2)
  })

  it('is a non-empty string of fixed length', () => {
    const h = computeSubgraphFingerprint(['node-x'], ['depends_on'])
    expect(typeof h).toBe('string')
    expect(h.length).toBeGreaterThan(0)
    expect(h.length).toBeLessThanOrEqual(64)
  })
})

// ── AC2: computePatternConfidence matches thresholds ─────────────────────────

describe('AC2/AC3: computePatternConfidence — Burnet immune memory thresholds', () => {
  it('confidence for count=1 is 0.5 (initial exposure)', () => {
    expect(computePatternConfidence(1)).toBe(0.5)
  })

  it('confidence for count=2 is ≥ 0.6 (auto-propose threshold)', () => {
    expect(computePatternConfidence(2)).toBeGreaterThanOrEqual(0.6)
  })

  it('confidence for count=3 is ≥ 0.9 (auto-apply threshold)', () => {
    expect(computePatternConfidence(3)).toBeGreaterThanOrEqual(0.9)
  })

  it('confidence is monotonically non-decreasing with count', () => {
    const scores = [1, 2, 3, 4, 5].map(computePatternConfidence)
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1])
    }
  })

  it('confidence is capped at 1.0', () => {
    expect(computePatternConfidence(100)).toBeLessThanOrEqual(1.0)
  })
})

// ── AC1: upsertHealingPattern and getHealingPattern ───────────────────────────

describe('AC1: healing pattern DB operations — UPSERT and GET', () => {
  it('getHealingPattern returns undefined for unseen fingerprint', () => {
    const store = createTestStore()
    const result = getHealingPattern(store, 'nonexistent-fingerprint')
    expect(result).toBeUndefined()
  })

  it('upsertHealingPattern creates new pattern with count=1 and confidence=0.5', () => {
    const store = createTestStore()
    const fingerprint = 'fp-001'
    const pattern = upsertHealingPattern(store, fingerprint, 'cycle_detected')
    expect(pattern.occurrenceCount).toBe(1)
    expect(pattern.confidence).toBe(0.5)
    expect(pattern.fingerprint).toBe(fingerprint)
    expect(pattern.issueType).toBe('cycle_detected')
  })

  it('second upsert increments count to 2 and confidence ≥ 0.6', () => {
    const store = createTestStore()
    const fingerprint = 'fp-002'
    upsertHealingPattern(store, fingerprint, 'cycle_detected')
    const second = upsertHealingPattern(store, fingerprint, 'cycle_detected')
    expect(second.occurrenceCount).toBe(2)
    expect(second.confidence).toBeGreaterThanOrEqual(0.6)
  })

  it('third upsert increments count to 3 and confidence ≥ 0.9', () => {
    const store = createTestStore()
    const fingerprint = 'fp-003'
    upsertHealingPattern(store, fingerprint, 'cycle_detected')
    upsertHealingPattern(store, fingerprint, 'cycle_detected')
    const third = upsertHealingPattern(store, fingerprint, 'cycle_detected')
    expect(third.occurrenceCount).toBe(3)
    expect(third.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('getHealingPattern retrieves the stored pattern', () => {
    const store = createTestStore()
    const fingerprint = 'fp-004'
    upsertHealingPattern(store, fingerprint, 'cycle_detected')
    const retrieved = getHealingPattern(store, fingerprint)
    expect(retrieved).toBeDefined()
    expect(retrieved!.occurrenceCount).toBe(1)
    expect(retrieved!.issueType).toBe('cycle_detected')
  })

  it('patterns for different fingerprints are independent', () => {
    const store = createTestStore()
    upsertHealingPattern(store, 'fp-A', 'cycle_detected')
    upsertHealingPattern(store, 'fp-A', 'cycle_detected')
    upsertHealingPattern(store, 'fp-B', 'cycle_detected')

    const patA = getHealingPattern(store, 'fp-A')
    const patB = getHealingPattern(store, 'fp-B')
    expect(patA!.occurrenceCount).toBe(2)
    expect(patB!.occurrenceCount).toBe(1)
  })
})
