/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * SQLite-backed pheromone trails (stigmergy lever): deposit reinforces with
 * `e^{-λt}` evaporation; strongestPheromones ranks the surviving trails.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations, configureDb } from '../core/store/migrations.js'
import {
  depositPheromone,
  depositHarnessDimensionPheromone,
  strongestPheromones,
  getAggregatedTagPheromone,
  PHEROMONE_HALF_LIFE_MS,
} from '../core/economy/pheromone-store.js'

describe('pheromone-store', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    configureDb(db)
    runMigrations(db)
  })
  afterEach(() => db.close())

  it('returns nothing for a project with no trails', () => {
    expect(strongestPheromones(db, 'proj_x')).toEqual([])
  })

  it('deposits and reads the strongest trail, freshest first by strength', () => {
    const now = 1_000_000
    depositPheromone(db, 'p', 'file:a.ts', 1, now)
    depositPheromone(db, 'p', 'file:b.ts', 3, now)
    const top = strongestPheromones(db, 'p', 5, now)
    expect(top[0].key).toBe('file:b.ts')
    expect(top.map((t) => t.key)).toContain('file:a.ts')
  })

  it('reinforces an existing trail (deposit accumulates on the same key)', () => {
    const now = 2_000_000
    depositPheromone(db, 'p', 'file:a.ts', 1, now)
    depositPheromone(db, 'p', 'file:a.ts', 1, now)
    const [a] = strongestPheromones(db, 'p', 5, now)
    expect(a.key).toBe('file:a.ts')
    expect(a.strength).toBeCloseTo(2, 5)
  })

  it('evaporates a trail toward half strength over one half-life', () => {
    const t0 = 5_000_000
    depositPheromone(db, 'p', 'file:a.ts', 1, t0)
    const later = strongestPheromones(db, 'p', 5, t0 + PHEROMONE_HALF_LIFE_MS)
    expect(later[0].strength).toBeCloseTo(0.5, 2)
  })

  it('drops trails that have evaporated below epsilon', () => {
    const t0 = 9_000_000
    depositPheromone(db, 'p', 'file:a.ts', 1, t0)
    // Ten half-lives ⇒ strength ≈ 2^-10 ≈ 0.001 < epsilon-ish; twenty ⇒ definitely gone.
    const gone = strongestPheromones(db, 'p', 5, t0 + 20 * PHEROMONE_HALF_LIFE_MS)
    expect(gone).toEqual([])
  })

  it('keeps trails scoped per project', () => {
    const now = 3_000_000
    depositPheromone(db, 'p1', 'file:a.ts', 1, now)
    depositPheromone(db, 'p2', 'file:b.ts', 1, now)
    expect(strongestPheromones(db, 'p1', 5, now).map((t) => t.key)).toEqual(['file:a.ts'])
    expect(strongestPheromones(db, 'p2', 5, now).map((t) => t.key)).toEqual(['file:b.ts'])
  })

  describe('depositHarnessDimensionPheromone', () => {
    it('deposits per-dimension trail with amount = delta/10 when delta > 0', () => {
      const now = 4_000_000
      depositHarnessDimensionPheromone(db, 'p', { tests: 8, types: 0 }, 'coverage', now)
      const trails = strongestPheromones(db, 'p', 10, now)
      const testsTrail = trails.find((t) => t.key === 'dimension:tests:pattern:coverage')
      const typesTrail = trails.find((t) => t.key === 'dimension:types:pattern:coverage')
      expect(testsTrail?.strength).toBeCloseTo(0.8, 5)
      expect(typesTrail).toBeUndefined()
    })

    it('skips all dimensions when all deltas are zero or negative', () => {
      const now = 5_000_000
      depositHarnessDimensionPheromone(db, 'p', { tests: 0, docs: -2 }, 'refactor', now)
      expect(strongestPheromones(db, 'p', 10, now)).toEqual([])
    })

    it('deposits multiple dimensions in the same call', () => {
      const now = 6_000_000
      depositHarnessDimensionPheromone(db, 'p', { tests: 10, docs: 5, types: 0 }, 'tdd', now)
      const keys = strongestPheromones(db, 'p', 10, now).map((t) => t.key)
      expect(keys).toContain('dimension:tests:pattern:tdd')
      expect(keys).toContain('dimension:docs:pattern:tdd')
      expect(keys).not.toContain('dimension:types:pattern:tdd')
    })
  })

  // Regression for bug node_31eab5a12cd6: a DB where the v114 migration is recorded as
  // applied but pheromone_trails was never created (ledger/effect divergence) made
  // `agf next --aco` throw "no such table: pheromone_trails" and silently lost deposits.
  // The store must self-heal its own table at point of use — no migrations run here.
  describe('self-heals a missing pheromone_trails table', () => {
    it('getAggregatedTagPheromone returns 0 (not throw) on a DB with no table', () => {
      const raw = new Database(':memory:') // deliberately no migrations → table absent
      expect(() => getAggregatedTagPheromone(raw, 'p1', ['aco'])).not.toThrow()
      expect(getAggregatedTagPheromone(raw, 'p1', ['aco'])).toBe(0)
      raw.close()
    })

    it('depositPheromone then read works end-to-end on a DB with no pre-created table', () => {
      const raw = new Database(':memory:')
      depositPheromone(raw, 'p1', 'tag:aco', 2, 1000)
      expect(getAggregatedTagPheromone(raw, 'p1', ['aco'], 1000)).toBeGreaterThan(0)
      raw.close()
    })

    it('strongestPheromones returns [] (not throw) on a DB with no table', () => {
      const raw = new Database(':memory:')
      expect(() => strongestPheromones(raw, 'p1')).not.toThrow()
      expect(strongestPheromones(raw, 'p1')).toEqual([])
      raw.close()
    })
  })
})
