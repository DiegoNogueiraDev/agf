/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { insertEpisodicOutcome } from '../core/store/episodic-outcomes-store.js'
import {
  DEFAULT_TIER_WEIGHTS,
  rankTieredMemories,
  shouldPageOut,
  pageOutSummary,
  searchAllTiers,
  type TierCandidate,
} from '../core/memory/memgpt-tiers.js'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

describe('rankTieredMemories (pure relevance ranking across tiers)', () => {
  const candidates: TierCandidate[] = [
    { tier: 'hot', id: 'h1', text: 'redis cache wiring for the gateway' },
    { tier: 'warm', id: 'w1', text: 'redis fallback approach confirmed' },
    { tier: 'cold', id: 'c1', text: 'archival note about redis and caching strategy' },
    { tier: 'cold', id: 'c2', text: 'unrelated note about typography tokens' },
  ]

  it('returns only candidates that contain the query term', () => {
    const ranked = rankTieredMemories('redis', candidates)
    expect(ranked.map((r) => r.id)).not.toContain('c2')
    expect(ranked.length).toBe(3)
  })

  it('tags each result with its originating tier', () => {
    const ranked = rankTieredMemories('redis', candidates)
    const byId = Object.fromEntries(ranked.map((r) => [r.id, r.tier]))
    expect(byId.h1).toBe('hot')
    expect(byId.w1).toBe('warm')
    expect(byId.c1).toBe('cold')
  })

  it('weights hot above warm above cold for equal raw relevance', () => {
    const equal: TierCandidate[] = [
      { tier: 'cold', id: 'c', text: 'alpha' },
      { tier: 'warm', id: 'w', text: 'alpha' },
      { tier: 'hot', id: 'h', text: 'alpha' },
    ]
    const ranked = rankTieredMemories('alpha', equal)
    expect(ranked.map((r) => r.id)).toEqual(['h', 'w', 'c'])
  })

  it('is case-insensitive', () => {
    expect(rankTieredMemories('REDIS', candidates).length).toBe(3)
  })

  it('respects the limit', () => {
    expect(rankTieredMemories('redis', candidates, { limit: 2 }).length).toBe(2)
  })

  it('returns an empty array for a no-match query', () => {
    expect(rankTieredMemories('nonexistentterm', candidates)).toEqual([])
  })

  it('produces a snippet around the match', () => {
    const ranked = rankTieredMemories('typography', candidates)
    expect(ranked[0]?.snippet.toLowerCase()).toContain('typography')
  })

  it('exposes default tier weights ordered hot > warm > cold', () => {
    expect(DEFAULT_TIER_WEIGHTS.hot).toBeGreaterThan(DEFAULT_TIER_WEIGHTS.warm)
    expect(DEFAULT_TIER_WEIGHTS.warm).toBeGreaterThan(DEFAULT_TIER_WEIGHTS.cold)
  })
})

describe('shouldPageOut (paging when hot exceeds the history window)', () => {
  it('does not page when hot count is within the window', () => {
    expect(shouldPageOut(12, 12)).toBe(false)
    expect(shouldPageOut(5, 12)).toBe(false)
  })

  it('pages when hot count exceeds the window', () => {
    expect(shouldPageOut(13, 12)).toBe(true)
  })
})

describe('pageOutSummary (deterministic auto-summarize of overflow)', () => {
  it('summarizes overflow blocks deterministically (no LLM)', () => {
    const overflow: TierCandidate[] = [
      { tier: 'hot', id: 'a', text: 'first block line\nmore detail' },
      { tier: 'hot', id: 'b', text: 'second block line\nmore detail' },
    ]
    const s1 = pageOutSummary(overflow)
    const s2 = pageOutSummary(overflow)
    expect(s1).toBe(s2)
    expect(s1).toContain('first block line')
    expect(s1).toContain('second block line')
  })

  it('returns an empty string for no overflow', () => {
    expect(pageOutSummary([])).toBe('')
  })
})

describe('session length stays bounded under repeated paging (measured)', () => {
  it('keeps hot tier <= window while archiving overflow to cold', () => {
    const window = 4
    let hot: TierCandidate[] = []
    const cold: string[] = []

    // Simulate a long session: 100 turns appended to the hot tier.
    for (let turn = 0; turn < 100; turn++) {
      hot.push({ tier: 'hot', id: `t${turn}`, text: `turn ${turn} did some work` })
      if (shouldPageOut(hot.length, window)) {
        const overflow = hot.slice(0, hot.length - window)
        cold.push(pageOutSummary(overflow))
        hot = hot.slice(hot.length - window)
      }
      // Invariant: hot never grows past the window — token usage is bounded.
      expect(hot.length).toBeLessThanOrEqual(window)
    }

    // Nothing was lost: overflow was archived to cold for later recall.
    expect(cold.length).toBeGreaterThan(0)
  })
})

describe('searchAllTiers (orchestrated recall across warm + cold on demand)', () => {
  let db: Database.Database
  let dir: string

  beforeEach(() => {
    db = createDb()
    dir = mkdtempSync(join(tmpdir(), 'memgpt-tiers-'))
    mkdirSync(join(dir, 'workflow-graph', 'memories'), { recursive: true })
  })

  afterEach(() => {
    db.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('spans hot, warm (episodic) and cold (file) tiers in one ranked result', async () => {
    // warm tier: an episodic outcome
    insertEpisodicOutcome(db, {
      id: 'ep1',
      nodeId: 'node_warm',
      taskType: 'cache',
      tags: 'redis,cache',
      approachSummary: 'redis fallback approach confirmed',
      outcome: 'success',
      cycleTimeDelta: 0,
      reopenCount: 0,
      createdAt: Date.now(),
    })
    // cold tier: a file memory
    writeFileSync(join(dir, 'workflow-graph', 'memories', 'redis-note.md'), 'archival redis caching strategy')

    const results = await searchAllTiers(
      'redis',
      { hotBlocks: [{ tier: 'hot', id: 'session', text: 'current redis wiring task' }], db, basePath: dir },
      { limit: 10 },
    )

    const tiers = new Set(results.map((r) => r.tier))
    expect(tiers.has('hot')).toBe(true)
    expect(tiers.has('warm')).toBe(true)
    expect(tiers.has('cold')).toBe(true)
  })

  it('works with only cold + warm sources (no live session hot blocks)', async () => {
    writeFileSync(join(dir, 'workflow-graph', 'memories', 'note.md'), 'pheromone trail for redis')
    const results = await searchAllTiers('redis', { db, basePath: dir })
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.tier !== 'hot')).toBe(true)
  })

  it('returns empty when nothing matches', async () => {
    const results = await searchAllTiers('zzzznomatch', { db, basePath: dir })
    expect(results).toEqual([])
  })
})
