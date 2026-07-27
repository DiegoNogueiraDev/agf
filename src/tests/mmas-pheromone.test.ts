/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import type Database from 'better-sqlite3'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { mmasDeposit as deposit } from '../core/economy/mmas-pheromone.js'
import {
  TAU_MIN,
  TAU_MAX,
  RHO,
  XI,
  ELITE_WEIGHT,
  STAGNATION_THRESHOLD,
  DIFFUSE_MAX,
  ALPHA_BASE,
  ALPHA_DIFFUSE,
  clampTau,
  mmasDeposit,
  globalEvaporation,
  localDecay,
  elitistReinforce,
  normalizedEntropy,
  colonyEntropy,
  mmasReset,
  isStagnant,
  classifyEntropy,
  stagnationControl,
  rhoSchedule,
} from '../core/economy/mmas-pheromone.js'
import { readBestSoFar } from '../core/economy/best-so-far-store.js'

const NOW = 1_700_000_000_000

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('mmas-test')
  return store
}

function rawAmount(db: Database.Database, projectId: string, key: string): number {
  const row = db.prepare('SELECT amount FROM pheromone_trails WHERE project_id = ? AND key = ?').get(projectId, key) as
    { amount: number } | undefined
  return row ? row.amount : 0
}

describe('MMAS clamps (AC2) — τ_min=0.1, τ_max=5.0 enforced on all mutations', () => {
  it('clampTau bounds to [τ_min, τ_max]', () => {
    expect(clampTau(10)).toBe(TAU_MAX)
    expect(clampTau(0.001)).toBe(TAU_MIN)
    expect(clampTau(2.5)).toBe(2.5)
  })

  it('mmasDeposit clamps the stored strength to τ_max', () => {
    const s = makeStore()
    const db = s.getDb()
    const p = s.getProject()!.id
    const tau = deposit(db, p, 'tag:x', 100, NOW)
    expect(tau).toBe(TAU_MAX)
    expect(rawAmount(db, p, 'tag:x')).toBeCloseTo(TAU_MAX)
    s.close()
  })
})

describe('MMAS evaporation (AC4) + local decay (AC3)', () => {
  it('globalEvaporation multiplies τ by (1-ρ) and floors at τ_min', () => {
    const s = makeStore()
    const db = s.getDb()
    const p = s.getProject()!.id
    mmasDeposit(db, p, 'a', 4.0, NOW) // τ=4
    mmasDeposit(db, p, 'b', TAU_MIN, NOW) // already at τ_min (0.01)
    const changed = globalEvaporation(db, p, RHO, TAU_MIN)
    expect(changed).toBe(2)
    expect(rawAmount(db, p, 'a')).toBeCloseTo(3.6) // 4 * 0.9
    expect(rawAmount(db, p, 'b')).toBeCloseTo(TAU_MIN) // floored at τ_min (0.01 * 0.9 < τ_min)
    s.close()
  })

  it('localDecay applies the ACS rule (1-ξ)·τ + ξ·τ_min toward τ_min', () => {
    const s = makeStore()
    const db = s.getDb()
    const p = s.getProject()!.id
    mmasDeposit(db, p, 'sel', 3.0, NOW)
    const next = localDecay(db, p, 'sel', XI, TAU_MIN, TAU_MAX, NOW) // 0.9*3 + 0.1*0.01 = 2.701
    expect(next).toBeCloseTo(2.701)
    expect(rawAmount(db, p, 'sel')).toBeCloseTo(2.701)
    s.close()
  })
})

describe('MMAS elitist reinforcement (AC5) — e=2.0 for best-so-far', () => {
  it('adds e·amount to the best-so-far trail, clamped to τ_max', () => {
    const s = makeStore()
    const db = s.getDb()
    const p = s.getProject()!.id
    mmasDeposit(db, p, 'best', 1.0, NOW)
    expect(elitistReinforce(db, p, 'best', 1.0, ELITE_WEIGHT, NOW)).toBeCloseTo(3.0) // 1 + 2*1
    mmasDeposit(db, p, 'best2', 4.0, NOW)
    expect(elitistReinforce(db, p, 'best2', 2.0, ELITE_WEIGHT, NOW)).toBe(TAU_MAX) // 4 + 2*2 → clamp
    s.close()
  })
})

describe('MMAS entropy + stagnation (AC6) — H_norm < 0.30 triggers reset', () => {
  it('normalizedEntropy: uniform→1, single→0, empty→0, skewed in between', () => {
    expect(normalizedEntropy([1, 1, 1, 1])).toBeCloseTo(1.0)
    expect(normalizedEntropy([5])).toBe(0)
    expect(normalizedEntropy([])).toBe(0)
    const skew = normalizedEntropy([10, 0.1, 0.1, 0.1])
    expect(skew).toBeGreaterThan(0)
    expect(skew).toBeLessThan(0.6)
  })

  it('isStagnant is true only when H_norm < threshold (boundary excluded)', () => {
    expect(isStagnant(0.2)).toBe(true)
    expect(isStagnant(0.5)).toBe(false)
    expect(isStagnant(STAGNATION_THRESHOLD)).toBe(false)
  })

  it('classifyEntropy maps H_norm into the 3 MMAS bands (boundaries inclusive of healthy)', () => {
    expect(classifyEntropy(0.2)).toBe('stagnant')
    expect(classifyEntropy(STAGNATION_THRESHOLD)).toBe('healthy') // 0.30 not < 0.30
    expect(classifyEntropy(0.5)).toBe('healthy')
    expect(classifyEntropy(DIFFUSE_MAX)).toBe('healthy') // 0.85 not > 0.85
    expect(classifyEntropy(0.95)).toBe('diffuse')
  })

  it('mmasReset sets all trails to τ_max → entropy re-diversifies to 1', () => {
    const s = makeStore()
    const db = s.getDb()
    const p = s.getProject()!.id
    mmasDeposit(db, p, 'a', 0.2, NOW)
    mmasDeposit(db, p, 'b', 4.5, NOW)
    expect(isStagnant(colonyEntropy(db, p, NOW))).toBe(true) // skewed → stagnant
    const n = mmasReset(db, p, TAU_MAX, NOW)
    expect(n).toBe(2)
    expect(rawAmount(db, p, 'a')).toBeCloseTo(TAU_MAX)
    expect(rawAmount(db, p, 'b')).toBeCloseTo(TAU_MAX)
    expect(colonyEntropy(db, p, NOW)).toBeCloseTo(1.0) // uniform after reset
    s.close()
  })
})

describe('stagnationControl — Phase 6 controller (evaporate → measure → act)', () => {
  it('stagnant colony (H_norm < 0.30) → reset all trails to τ_max', () => {
    const s = makeStore()
    const db = s.getDb()
    const p = s.getProject()!.id
    mmasDeposit(db, p, 'dominant', 5.0, NOW)
    mmasDeposit(db, p, 'tiny1', 0.1, NOW)
    mmasDeposit(db, p, 'tiny2', 0.1, NOW)
    const d = stagnationControl(db, p, { nowMs: NOW })
    expect(d.band).toBe('stagnant')
    expect(d.action).toBe('reset')
    expect(d.trailsReset).toBe(3)
    expect(d.alpha).toBe(ALPHA_BASE)
    expect(rawAmount(db, p, 'dominant')).toBeCloseTo(TAU_MAX) // re-diversified
    expect(rawAmount(db, p, 'tiny1')).toBeCloseTo(TAU_MAX)
    s.close()
  })

  // T3/AC1 — the live done path swaps depositPheromone→mmasDeposit so trails are
  // bounded: a trail already at τ_max stays ≤ τ_max after another deposit.
  it('a trail at τ_max stays ≤ τ_max after a further deposit (bounded reward path)', () => {
    const s = makeStore()
    const db = s.getDb()
    const p = s.getProject()!.id
    mmasDeposit(db, p, 'hot', TAU_MAX, NOW)
    const after = mmasDeposit(db, p, 'hot', 10.0, NOW)
    expect(after).toBeLessThanOrEqual(TAU_MAX)
    expect(rawAmount(db, p, 'hot')).toBeLessThanOrEqual(TAU_MAX)
    s.close()
  })

  // T3/AC3 — elitist reset: the champion (argmax τ before the wipe) is captured and
  // returned/persisted, so re-diversification does not erase which trail was best.
  // The field itself still re-diversifies to τ_max (existing invariant untouched).
  it('stagnation reset preserves the best-so-far champion (elitist), field still τ_max', () => {
    const s = makeStore()
    const db = s.getDb()
    const p = s.getProject()!.id
    mmasDeposit(db, p, 'champion', 5.0, NOW)
    mmasDeposit(db, p, 'weak1', 0.1, NOW)
    mmasDeposit(db, p, 'weak2', 0.1, NOW)
    const d = stagnationControl(db, p, { nowMs: NOW })
    expect(d.action).toBe('reset')
    expect(d.bestKey).toBe('champion') // captured before the wipe
    expect(rawAmount(db, p, 'champion')).toBeCloseTo(TAU_MAX) // field re-diversified
    expect(rawAmount(db, p, 'weak1')).toBeCloseTo(TAU_MAX)
    expect(readBestSoFar(db, p)?.key).toBe('champion') // remembered across the reset
    s.close()
  })

  it('a non-reset (healthy) tick leaves bestKey undefined', () => {
    const s = makeStore()
    const db = s.getDb()
    const p = s.getProject()!.id
    mmasDeposit(db, p, 'a', 4.0, NOW)
    mmasDeposit(db, p, 'b', 1.0, NOW)
    mmasDeposit(db, p, 'c', 0.5, NOW)
    expect(stagnationControl(db, p, { nowMs: NOW }).bestKey).toBeUndefined()
    s.close()
  })

  it('healthy colony (0.30 ≤ H_norm ≤ 0.85) → continue, no reset, base α', () => {
    const s = makeStore()
    const db = s.getDb()
    const p = s.getProject()!.id
    mmasDeposit(db, p, 'a', 4.0, NOW)
    mmasDeposit(db, p, 'b', 1.0, NOW)
    mmasDeposit(db, p, 'c', 0.5, NOW)
    const d = stagnationControl(db, p, { nowMs: NOW })
    expect(d.band).toBe('healthy')
    expect(d.action).toBe('continue')
    expect(d.trailsReset).toBe(0)
    expect(d.alpha).toBe(ALPHA_BASE)
    s.close()
  })

  it('diffuse colony (H_norm > 0.85) → boost α temporarily, no reset', () => {
    const s = makeStore()
    const db = s.getDb()
    const p = s.getProject()!.id
    for (const k of ['a', 'b', 'c', 'd', 'e']) mmasDeposit(db, p, k, 1.0, NOW)
    const d = stagnationControl(db, p, { nowMs: NOW })
    expect(d.band).toBe('diffuse')
    expect(d.action).toBe('boost_alpha')
    expect(d.alpha).toBe(ALPHA_DIFFUSE)
    expect(d.trailsReset).toBe(0)
    s.close()
  })

  it('applies global evaporation in MMAS order (after deposits, before measuring)', () => {
    const s = makeStore()
    const db = s.getDb()
    const p = s.getProject()!.id
    mmasDeposit(db, p, 'a', 4.0, NOW)
    mmasDeposit(db, p, 'b', 4.0, NOW)
    stagnationControl(db, p, { nowMs: NOW })
    expect(rawAmount(db, p, 'a')).toBeCloseTo(3.6) // 4 * (1 - ρ)
    s.close()
  })

  it('insufficient trails (<2) → continue without a false stagnation reset', () => {
    const s = makeStore()
    const db = s.getDb()
    const p = s.getProject()!.id
    const empty = stagnationControl(db, p, { nowMs: NOW })
    expect(empty.band).toBe('healthy')
    expect(empty.action).toBe('continue')
    expect(empty.trailsReset).toBe(0)
    mmasDeposit(db, p, 'solo', 3.0, NOW)
    expect(stagnationControl(db, p, { nowMs: NOW }).action).toBe('continue')
    s.close()
  })
})

describe('rhoSchedule — thermodynamic ρ schedule (node_363c9e90f4d3)', () => {
  it('at t=0 returns rho0 (high initial evaporation)', () => {
    expect(rhoSchedule(0, 0.3, 0.02, 100)).toBeCloseTo(0.3)
  })

  it('at t much greater than lambda, converges toward rhoF (within 0.001)', () => {
    expect(rhoSchedule(1000, 0.3, 0.02, 100)).toBeCloseTo(0.02, 2)
  })

  it('is monotonically decreasing between rho0 and rhoF', () => {
    const early = rhoSchedule(10, 0.3, 0.02, 100)
    const mid = rhoSchedule(100, 0.3, 0.02, 100)
    const late = rhoSchedule(500, 0.3, 0.02, 100)
    expect(early).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(late)
    expect(late).toBeGreaterThanOrEqual(0.02)
  })
})

describe('stagnationControl — thermodynamic ρ-schedule opt-in (node_363c9e90f4d3)', () => {
  it('without schedule params, uses the static ρ (byte-identical, zero regression)', () => {
    const s = makeStore()
    const db = s.getDb()
    const p = s.getProject()!.id
    mmasDeposit(db, p, 'a', 4.0, NOW)
    mmasDeposit(db, p, 'b', 4.0, NOW)
    stagnationControl(db, p, { nowMs: NOW })
    expect(rawAmount(db, p, 'a')).toBeCloseTo(3.6) // 4 * (1 - RHO=0.1), same as existing test
    s.close()
  })

  it('with rho0/rhoF/lambda/t configured, applies the scheduled ρ(t) instead of the static ρ', () => {
    const s = makeStore()
    const db = s.getDb()
    const p = s.getProject()!.id
    mmasDeposit(db, p, 'a', 4.0, NOW)
    mmasDeposit(db, p, 'b', 4.0, NOW)
    // t=0 → rhoSchedule(0, 0.3, 0.02, 100) = 0.3 (much higher than static RHO=0.1)
    stagnationControl(db, p, { nowMs: NOW, rho0: 0.3, rhoF: 0.02, lambda: 100, t: 0 })
    expect(rawAmount(db, p, 'a')).toBeCloseTo(2.8) // 4 * (1 - 0.3)
    s.close()
  })

  it('with only some schedule params set (missing t), falls back to the static ρ', () => {
    const s = makeStore()
    const db = s.getDb()
    const p = s.getProject()!.id
    mmasDeposit(db, p, 'a', 4.0, NOW)
    mmasDeposit(db, p, 'b', 4.0, NOW)
    stagnationControl(db, p, { nowMs: NOW, rho0: 0.3, rhoF: 0.02, lambda: 100 })
    expect(rawAmount(db, p, 'a')).toBeCloseTo(3.6) // 4 * (1 - RHO=0.1), schedule not fully configured
    s.close()
  })
})
