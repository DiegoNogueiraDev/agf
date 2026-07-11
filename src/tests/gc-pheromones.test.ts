/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_fa50d5454d67 — E3.2: agf gc --pheromones prune weak trails
 *
 * AC: dry-run lists trails with effective_strength<0.05;
 *     --apply removes them;
 *     returns {pruned_count, total_trails, strongest_surviving}
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { depositPheromone } from '../core/economy/pheromone-store.js'
import { pruneWeakTrails } from '../core/economy/pheromone-store.js'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE pheromone_trails (
    project_id TEXT NOT NULL,
    key TEXT NOT NULL,
    amount REAL NOT NULL,
    ts INTEGER NOT NULL,
    PRIMARY KEY (project_id, key)
  )`)
  return db
}

describe('pruneWeakTrails', () => {
  let db: Database.Database
  const pid = 'test-project'
  const halfLifeMs = 7 * 24 * 60 * 60 * 1000

  beforeEach(() => {
    db = makeDb()
  })

  it('returns total_trails count', () => {
    depositPheromone(db, pid, 'trail-a', 1.0, Date.now())
    depositPheromone(db, pid, 'trail-b', 0.01, Date.now())
    const result = pruneWeakTrails(db, pid, 0.05, false)
    expect(result.total_trails).toBe(2)
  })

  it('identifies weak trails below threshold in dry-run', () => {
    const now = Date.now()
    // deposit very weak trail (already decayed)
    depositPheromone(db, pid, 'weak-trail', 0.001, now - halfLifeMs * 100, halfLifeMs)
    depositPheromone(db, pid, 'strong-trail', 2.0, now)
    const result = pruneWeakTrails(db, pid, 0.05, false) // dry-run
    expect(result.pruned_count).toBe(1)
  })

  it('does NOT delete trails in dry-run mode', () => {
    const now = Date.now()
    depositPheromone(db, pid, 'weak-trail', 0.001, now - halfLifeMs * 100, halfLifeMs)
    pruneWeakTrails(db, pid, 0.05, false) // dry-run
    const remaining = (db.prepare('SELECT COUNT(*) as c FROM pheromone_trails').get() as { c: number }).c
    expect(remaining).toBe(1) // still in DB
  })

  it('deletes weak trails when dryRun=false', () => {
    const now = Date.now()
    depositPheromone(db, pid, 'weak-trail', 0.001, now - halfLifeMs * 100, halfLifeMs)
    depositPheromone(db, pid, 'strong-trail', 2.0, now)
    pruneWeakTrails(db, pid, 0.05, true) // apply
    const remaining = (db.prepare('SELECT COUNT(*) as c FROM pheromone_trails').get() as { c: number }).c
    expect(remaining).toBe(1) // only strong-trail survives
  })

  it('returns pruned_count=0 when no trails are below threshold', () => {
    depositPheromone(db, pid, 'strong-1', 1.0, Date.now())
    depositPheromone(db, pid, 'strong-2', 0.5, Date.now())
    const result = pruneWeakTrails(db, pid, 0.05, false)
    expect(result.pruned_count).toBe(0)
  })

  it('returns strongest_surviving as the key with highest effective strength', () => {
    const now = Date.now()
    depositPheromone(db, pid, 'medium-trail', 0.3, now)
    depositPheromone(db, pid, 'strong-trail', 2.0, now)
    depositPheromone(db, pid, 'weak-trail', 0.001, now - halfLifeMs * 100, halfLifeMs)
    const result = pruneWeakTrails(db, pid, 0.05, false)
    expect(result.strongest_surviving?.key).toBe('strong-trail')
  })

  it('returns strongest_surviving=null when all trails are below threshold', () => {
    const now = Date.now()
    depositPheromone(db, pid, 'weak-1', 0.001, now - halfLifeMs * 100, halfLifeMs)
    depositPheromone(db, pid, 'weak-2', 0.001, now - halfLifeMs * 100, halfLifeMs)
    const result = pruneWeakTrails(db, pid, 0.05, true)
    expect(result.strongest_surviving).toBeNull()
  })

  it('returns empty total_trails when db has no trails', () => {
    const result = pruneWeakTrails(db, pid, 0.05, false)
    expect(result.total_trails).toBe(0)
    expect(result.pruned_count).toBe(0)
  })

  it('prunes only trails for the specified project_id', () => {
    const now = Date.now()
    depositPheromone(db, pid, 'weak-trail', 0.001, now - halfLifeMs * 100, halfLifeMs)
    depositPheromone(db, 'other-project', 'weak-trail', 0.001, now - halfLifeMs * 100, halfLifeMs)
    const result = pruneWeakTrails(db, pid, 0.05, true)
    expect(result.pruned_count).toBe(1)
    const remaining = (
      db.prepare("SELECT COUNT(*) as c FROM pheromone_trails WHERE project_id='other-project'").get() as { c: number }
    ).c
    expect(remaining).toBe(1) // other project untouched
  })
})
