/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 3.3 AC coverage: pruneExpiredTrails in pheromone-store.ts
 *
 * AC1: GIVEN trail amount<epsilon AND age>maxAge WHEN GC THEN trail removed
 * AC2: GIVEN trail amount>=epsilon AND age>maxAge WHEN GC THEN trail preserved
 * AC3: GIVEN trail amount<epsilon AND age<maxAge WHEN GC THEN trail preserved
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  depositPheromone,
  pruneExpiredTrails,
  strongestPheromones,
  PHEROMONE_HALF_LIFE_MS,
} from '../core/economy/pheromone-store.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_MAX_AGE_MS = 30 * DAY_MS
const DEFAULT_EPSILON = 0.05
const NOW = 1_000_000_000_000 // fixed reference timestamp

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE pheromone_trails (
      project_id TEXT NOT NULL,
      key TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      ts INTEGER NOT NULL,
      PRIMARY KEY (project_id, key)
    )
  `)
  return db
}

function insertTrail(db: Database.Database, key: string, amount: number, ageMs: number, projectId = 'proj') {
  db.prepare('INSERT INTO pheromone_trails (project_id, key, amount, ts) VALUES (?, ?, ?, ?)').run(
    projectId,
    key,
    amount,
    NOW - ageMs,
  )
}

function countTrails(db: Database.Database, projectId = 'proj'): number {
  const row = db.prepare('SELECT COUNT(*) as n FROM pheromone_trails WHERE project_id = ?').get(projectId) as {
    n: number
  }
  return row.n
}

function trailExists(db: Database.Database, key: string, projectId = 'proj'): boolean {
  const row = db
    .prepare('SELECT 1 as found FROM pheromone_trails WHERE project_id = ? AND key = ?')
    .get(projectId, key) as { found: number } | undefined
  return Boolean(row?.found)
}

// ── AC1: weak + old → removed ─────────────────────────────────────────────────

describe('AC1: trail with amount<epsilon AND age>maxAge is removed', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeDb()
  })

  it('removes a trail with amount=0.04 after 31 days (AC1)', () => {
    insertTrail(db, 'key-weak-old', 0.04, 31 * DAY_MS)
    pruneExpiredTrails(db, 'proj', DEFAULT_EPSILON, DEFAULT_MAX_AGE_MS, NOW)
    expect(trailExists(db, 'key-weak-old')).toBe(false)
  })

  it('returns count of removed trails (AC1)', () => {
    insertTrail(db, 'k1', 0.04, 31 * DAY_MS)
    insertTrail(db, 'k2', 0.03, 45 * DAY_MS)
    const removed = pruneExpiredTrails(db, 'proj', DEFAULT_EPSILON, DEFAULT_MAX_AGE_MS, NOW)
    expect(removed).toBe(2)
  })

  it('removes trail with amount exactly at epsilon-0.01 after 30+1 days (AC1)', () => {
    insertTrail(db, 'key-borderline', 0.049, 31 * DAY_MS)
    pruneExpiredTrails(db, 'proj', DEFAULT_EPSILON, DEFAULT_MAX_AGE_MS, NOW)
    expect(trailExists(db, 'key-borderline')).toBe(false)
  })

  it('removes multiple weak+old trails in one GC pass (AC1)', () => {
    insertTrail(db, 'k1', 0.01, 35 * DAY_MS)
    insertTrail(db, 'k2', 0.02, 32 * DAY_MS)
    insertTrail(db, 'k3', 0.04, 31 * DAY_MS)
    pruneExpiredTrails(db, 'proj', DEFAULT_EPSILON, DEFAULT_MAX_AGE_MS, NOW)
    expect(countTrails(db)).toBe(0)
  })

  it('returns 0 when no trails qualify for pruning (AC1)', () => {
    const removed = pruneExpiredTrails(db, 'proj', DEFAULT_EPSILON, DEFAULT_MAX_AGE_MS, NOW)
    expect(removed).toBe(0)
  })
})

// ── AC2: strong trail above epsilon → preserved even if old ──────────────────

describe('AC2: trail with amount>=epsilon AND age>maxAge is preserved', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeDb()
  })

  it('preserves trail with amount=0.06 after 31 days (AC2)', () => {
    insertTrail(db, 'key-strong-old', 0.06, 31 * DAY_MS)
    pruneExpiredTrails(db, 'proj', DEFAULT_EPSILON, DEFAULT_MAX_AGE_MS, NOW)
    expect(trailExists(db, 'key-strong-old')).toBe(true)
  })

  it('preserves trail with amount=0.05 (exactly at epsilon) after 31 days (AC2)', () => {
    insertTrail(db, 'key-at-epsilon', 0.05, 31 * DAY_MS)
    pruneExpiredTrails(db, 'proj', DEFAULT_EPSILON, DEFAULT_MAX_AGE_MS, NOW)
    expect(trailExists(db, 'key-at-epsilon')).toBe(true)
  })

  it('preserves trail with amount=1.0 after 60 days (AC2)', () => {
    insertTrail(db, 'key-strong', 1.0, 60 * DAY_MS)
    pruneExpiredTrails(db, 'proj', DEFAULT_EPSILON, DEFAULT_MAX_AGE_MS, NOW)
    expect(trailExists(db, 'key-strong')).toBe(true)
  })

  it('count is unchanged when only strong trails exist (AC2)', () => {
    insertTrail(db, 'k1', 0.1, 31 * DAY_MS)
    insertTrail(db, 'k2', 0.5, 60 * DAY_MS)
    pruneExpiredTrails(db, 'proj', DEFAULT_EPSILON, DEFAULT_MAX_AGE_MS, NOW)
    expect(countTrails(db)).toBe(2)
  })
})

// ── AC3: weak trail within maxAge → preserved ────────────────────────────────

describe('AC3: trail with amount<epsilon AND age<maxAge is preserved', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeDb()
  })

  it('preserves trail with amount=0.04 after only 29 days (AC3)', () => {
    insertTrail(db, 'key-weak-fresh', 0.04, 29 * DAY_MS)
    pruneExpiredTrails(db, 'proj', DEFAULT_EPSILON, DEFAULT_MAX_AGE_MS, NOW)
    expect(trailExists(db, 'key-weak-fresh')).toBe(true)
  })

  it('preserves trail with amount=0.01 aged exactly 30 days (AC3: boundary, not older)', () => {
    insertTrail(db, 'key-exact-30d', 0.01, 30 * DAY_MS)
    pruneExpiredTrails(db, 'proj', DEFAULT_EPSILON, DEFAULT_MAX_AGE_MS, NOW)
    expect(trailExists(db, 'key-exact-30d')).toBe(true)
  })

  it('preserves just-deposited trail with low amount (AC3)', () => {
    insertTrail(db, 'key-new', 0.01, 0)
    pruneExpiredTrails(db, 'proj', DEFAULT_EPSILON, DEFAULT_MAX_AGE_MS, NOW)
    expect(trailExists(db, 'key-new')).toBe(true)
  })
})

// ── Mixed: only old+weak removed, others untouched ───────────────────────────

describe('mixed scenario: only qualifying trails are removed', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeDb()
  })

  it('removes only the weak-old trail when mixed with strong and fresh trails', () => {
    insertTrail(db, 'remove-me', 0.04, 31 * DAY_MS) // weak + old → REMOVE
    insertTrail(db, 'keep-strong', 0.06, 31 * DAY_MS) // strong + old → KEEP
    insertTrail(db, 'keep-fresh', 0.04, 29 * DAY_MS) // weak + fresh → KEEP
    pruneExpiredTrails(db, 'proj', DEFAULT_EPSILON, DEFAULT_MAX_AGE_MS, NOW)
    expect(trailExists(db, 'remove-me')).toBe(false)
    expect(trailExists(db, 'keep-strong')).toBe(true)
    expect(trailExists(db, 'keep-fresh')).toBe(true)
  })

  it('removes 1 of 3 trails and reports correct count', () => {
    insertTrail(db, 'remove', 0.04, 31 * DAY_MS)
    insertTrail(db, 'keep1', 0.1, 40 * DAY_MS)
    insertTrail(db, 'keep2', 0.02, 10 * DAY_MS)
    const removed = pruneExpiredTrails(db, 'proj', DEFAULT_EPSILON, DEFAULT_MAX_AGE_MS, NOW)
    expect(removed).toBe(1)
    expect(countTrails(db)).toBe(2)
  })
})

// ── Project isolation ──────────────────────────────────────────────────────────

describe('project isolation', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeDb()
  })

  it('only prunes trails for the specified project_id', () => {
    insertTrail(db, 'key', 0.04, 31 * DAY_MS, 'proj-A')
    insertTrail(db, 'key', 0.04, 31 * DAY_MS, 'proj-B')
    pruneExpiredTrails(db, 'proj-A', DEFAULT_EPSILON, DEFAULT_MAX_AGE_MS, NOW)
    expect(trailExists(db, 'key', 'proj-A')).toBe(false)
    expect(trailExists(db, 'key', 'proj-B')).toBe(true)
  })
})

// ── Custom epsilon/maxAge parameters ──────────────────────────────────────────

describe('custom epsilon and maxAgeMs', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeDb()
  })

  it('respects custom epsilon=0.1: removes amount=0.09 trail', () => {
    insertTrail(db, 'key', 0.09, 31 * DAY_MS)
    pruneExpiredTrails(db, 'proj', 0.1, DEFAULT_MAX_AGE_MS, NOW)
    expect(trailExists(db, 'key')).toBe(false)
  })

  it('respects custom maxAgeMs=7d: removes trail after 8 days', () => {
    insertTrail(db, 'key', 0.04, 8 * DAY_MS)
    pruneExpiredTrails(db, 'proj', DEFAULT_EPSILON, 7 * DAY_MS, NOW)
    expect(trailExists(db, 'key')).toBe(false)
  })
})
