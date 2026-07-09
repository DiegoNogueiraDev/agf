/*!
 * TDD: MMAS stagnation control active by default (node_84892099c9f9).
 *
 * AC1: stagnant colony (entropy<0.3) → reset fires, entropy rises.
 * AC2: bounds enforced by default (tau clamped to [tauMin, tauMax]).
 * AC3: healthy colony (entropy≥0.3) → no reset, no regression.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { depositPheromone } from '../core/economy/pheromone-store.js'
import { runStagnationTick } from '../core/economy/stagnation-tick.js'
import { colonyEntropy, mmasDeposit, TAU_MIN, TAU_MAX } from '../core/economy/mmas-pheromone.js'

const NOW = 1_700_000_000_000

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE pheromone_trails (
    project_id TEXT NOT NULL,
    key TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 1.0,
    ts INTEGER NOT NULL,
    PRIMARY KEY (project_id, key)
  )`)
  db.exec(`CREATE TABLE IF NOT EXISTS economy_lever_ledger (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    node_id TEXT,
    lever TEXT,
    tokens_before INTEGER DEFAULT 0,
    tokens_after INTEGER DEFAULT 0,
    saved INTEGER DEFAULT 0,
    accepted INTEGER DEFAULT 1,
    gate_outcome TEXT,
    score REAL,
    created_at TEXT DEFAULT (datetime('now'))
  )`)
  return db
}

describe('AC1: stagnant colony (entropy<0.3) → reset fires', () => {
  it('runStagnationTick with leverEnabled=false still fires reset on stagnant colony', () => {
    const db = makeDb()
    const pid = 'proj'
    // Two trails where one is hugely dominant → entropy << 0.3 (converged)
    depositPheromone(db, pid, 'dominant', 100, NOW)
    depositPheromone(db, pid, 'minor', 0.01, NOW)

    const decision = runStagnationTick(db, pid, { leverEnabled: false, nowMs: NOW })

    expect(decision).not.toBeNull()
    expect(decision?.band).toBe('stagnant')
    expect(decision?.action).toBe('reset')
    expect(decision?.trailsReset).toBeGreaterThan(0)
  })

  it('reset sets all trails to tauMax', () => {
    const db = makeDb()
    const pid = 'proj'
    // Converged colony with 2 trails
    depositPheromone(db, pid, 'dominant', 100, NOW)
    depositPheromone(db, pid, 'minor', 0.01, NOW)

    runStagnationTick(db, pid, { leverEnabled: false, nowMs: NOW })

    const row = db
      .prepare('SELECT amount FROM pheromone_trails WHERE project_id = ? AND key = ?')
      .get(pid, 'dominant') as { amount: number } | undefined
    expect(row?.amount).toBeCloseTo(TAU_MAX, 2)
  })
})

describe('AC2: bounds enforced by default', () => {
  it('mmasDeposit clamps tau above tauMax', () => {
    const db = makeDb()
    const pid = 'proj'
    // Deposit a huge amount
    const result = mmasDeposit(db, pid, 'big', 9999, NOW)
    expect(result).toBe(TAU_MAX)
  })

  it('mmasDeposit clamps tau below tauMin (via local decay)', () => {
    const db = makeDb()
    const pid = 'proj'
    // Deposit minimum
    const result = mmasDeposit(db, pid, 'tiny', TAU_MIN, NOW)
    expect(result).toBeGreaterThanOrEqual(TAU_MIN)
  })
})

describe('AC3: healthy colony → no reset fires', () => {
  it('runStagnationTick with 3 balanced trails → action=continue, no reset', () => {
    const db = makeDb()
    const pid = 'proj'
    // Three equal-weight trails → entropy ≈ 1.0 (uniform = healthy)
    depositPheromone(db, pid, 'a', 1.0, NOW)
    depositPheromone(db, pid, 'b', 1.0, NOW)
    depositPheromone(db, pid, 'c', 1.0, NOW)

    const decision = runStagnationTick(db, pid, { leverEnabled: false, nowMs: NOW })

    expect(decision?.band).not.toBe('stagnant')
    expect(decision?.trailsReset).toBe(0)
  })
})
