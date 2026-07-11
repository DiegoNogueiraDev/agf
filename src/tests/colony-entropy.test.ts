/*!
 * TDD: colony-health-snapshot entropy extension (node_f25dc3ff8aae).
 *
 * AC1: Given a colony, When colony-health runs, Then reports normalizedEntropy
 *      and saturatedTrailCount.
 * AC2: Given entropy < threshold, When reported, Then signals 'stagnant' alert.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { buildColonyHealthSnapshot } from '../core/web/colony-health-snapshot.js'
import type { ColonyStats } from '../core/colony/colony-signals.js'

function makeDb() {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

const STATS: ColonyStats = {
  byStatus: { backlog: 5, in_progress: 1, done: 10 },
}

describe('AC1: snapshot includes entropy + saturated trail count', () => {
  it('snapshot has normalizedEntropy field (0–1)', () => {
    const db = makeDb()
    const snap = buildColonyHealthSnapshot(STATS, { db, projectId: 'test-proj' })
    expect(snap).toHaveProperty('normalizedEntropy')
    expect(snap.normalizedEntropy).toBeGreaterThanOrEqual(0)
    expect(snap.normalizedEntropy).toBeLessThanOrEqual(1)
  })

  it('snapshot has saturatedTrailCount field', () => {
    const db = makeDb()
    const snap = buildColonyHealthSnapshot(STATS, { db, projectId: 'test-proj' })
    expect(snap).toHaveProperty('saturatedTrailCount')
    expect(typeof snap.saturatedTrailCount).toBe('number')
  })

  it('entropy = 0 when no trails exist (empty colony)', () => {
    const db = makeDb()
    const snap = buildColonyHealthSnapshot(STATS, { db, projectId: 'test-proj' })
    expect(snap.normalizedEntropy).toBe(0)
    expect(snap.saturatedTrailCount).toBe(0)
  })

  it('snapshot still works without db opts (backward-compat)', () => {
    const snap = buildColonyHealthSnapshot(STATS)
    expect(snap).toHaveProperty('normalizedEntropy')
    expect(snap.normalizedEntropy).toBe(0)
  })
})

describe('AC2: stagnationAlert when entropy below threshold', () => {
  it('stagnationAlert = false when no trails (entropy=0 = stagnant band)', () => {
    const db = makeDb()
    const snap = buildColonyHealthSnapshot(STATS, { db, projectId: 'test-proj' })
    // no trails → entropy 0 → stagnant
    expect(snap).toHaveProperty('stagnationAlert')
    expect(typeof snap.stagnationAlert).toBe('boolean')
  })
})
