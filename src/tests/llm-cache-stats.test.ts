/*!
 * Task node_d9e047bf0083 — agf cache stats command (core pure function).
 *
 * AC1: GIVEN cache stats computed THEN exposes: hitRate, totalHits, totalMisses, tokensSaved
 * AC2: GIVEN cache hits exist THEN estimatedSavingsUsd > 0 (delta vs baseline)
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { computeCacheStats, type CacheStats } from '../core/llm/cache-stats.js'

function openDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE llm_call_ledger (
      id TEXT PRIMARY KEY,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens INTEGER,
      cost_usd REAL NOT NULL DEFAULT 0
    )
  `)
  return db
}

function insertCall(
  db: Database.Database,
  id: string,
  inputTokens: number,
  cachedTokens: number | null,
  costUsd: number,
): void {
  db.prepare('INSERT INTO llm_call_ledger VALUES (?, ?, ?, ?)').run(id, inputTokens, cachedTokens, costUsd)
}

// ── AC1 — hitRate, totalHits, totalMisses, tokensSaved ───────────────────────

describe('computeCacheStats (AC1)', () => {
  it('returns hitRate, totalHits, totalMisses, tokensSaved', () => {
    const db = openDb()
    insertCall(db, 'a', 1000, 800, 0.003) // cache hit (cached > 0)
    insertCall(db, 'b', 500, 0, 0.002) // miss (cached = 0)
    insertCall(db, 'c', 600, null, 0.002) // miss (cached = null)

    const stats: CacheStats = computeCacheStats(db)
    expect(stats.hitRate).toBeCloseTo(1 / 3, 5)
    expect(stats.totalHits).toBe(1)
    expect(stats.totalMisses).toBe(2)
    expect(stats.tokensSaved).toBe(800)
  })

  it('returns zero stats when ledger is empty', () => {
    const db = openDb()
    const stats = computeCacheStats(db)
    expect(stats.hitRate).toBe(0)
    expect(stats.totalHits).toBe(0)
    expect(stats.totalMisses).toBe(0)
    expect(stats.tokensSaved).toBe(0)
  })

  it('hitRate = 1.0 when all calls have cached tokens', () => {
    const db = openDb()
    insertCall(db, 'x', 1000, 900, 0.003)
    insertCall(db, 'y', 800, 750, 0.002)
    const stats = computeCacheStats(db)
    expect(stats.hitRate).toBe(1.0)
    expect(stats.totalHits).toBe(2)
    expect(stats.totalMisses).toBe(0)
  })
})

// ── AC2 — estimatedSavingsUsd (delta vs uncached baseline) ───────────────────

describe('computeCacheStats (AC2 — savings delta)', () => {
  it('estimatedSavingsUsd > 0 when cache hits exist', () => {
    const db = openDb()
    insertCall(db, 'h', 2000, 1500, 0.006)
    const stats = computeCacheStats(db)
    expect(stats.estimatedSavingsUsd).toBeGreaterThan(0)
  })

  it('estimatedSavingsUsd = 0 when no cache hits', () => {
    const db = openDb()
    insertCall(db, 'm', 500, null, 0.002)
    const stats = computeCacheStats(db)
    expect(stats.estimatedSavingsUsd).toBe(0)
  })

  it('estimatedSavingsUsd = cachedTokens × $3/Mtok × 90% discount', () => {
    const db = openDb()
    insertCall(db, 'z', 2000, 1000, 0.006)
    const stats = computeCacheStats(db)
    const expected = (1000 / 1_000_000) * 3 * 0.9
    expect(stats.estimatedSavingsUsd).toBeCloseTo(expected, 8)
  })
})
