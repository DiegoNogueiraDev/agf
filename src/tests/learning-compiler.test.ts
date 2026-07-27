/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { DecisionTableStore } from '../core/learning/decision-table-store.js'
import { compileDecisions } from '../core/learning/learning-compiler.js'
import type { DecisionObservation } from '../core/learning/decision-key.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000

function obs(key: string, success: boolean, ts: number, decision: unknown = { model: 'haiku' }): DecisionObservation {
  return { key, context: { domain: 'd', phase: 'BUILD', role: 'impl', input: 'x' }, decision, success, ts }
}

function freshStore(): { store: DecisionTableStore } {
  return { store: new DecisionTableStore(new Database(':memory:')) }
}

describe('compileDecisions', () => {
  // AC1: GIVEN 2 successes (rate >= 0.7) for a key WHEN compile runs THEN a row is written
  it('compiles a rule when occurrences >= 2 and successRate >= 0.7', () => {
    const { store } = freshStore()
    const res = compileDecisions([obs('k', true, NOW), obs('k', true, NOW)], store, { now: NOW })
    expect(res.compiled).toBe(1)
    expect(res.emittedKeys).toContain('k')
    const row = store.get('k')
    expect(row).not.toBeNull()
    expect(row?.successRate).toBeGreaterThanOrEqual(0.7)
  })

  // AC2: GIVEN 1 occurrence OR rate < 0.7 WHEN compile runs THEN no row is written
  it('does not compile with a single occurrence', () => {
    const { store } = freshStore()
    const res = compileDecisions([obs('k', true, NOW)], store, { now: NOW })
    expect(res.compiled).toBe(0)
    expect(store.get('k')).toBeNull()
  })

  it('does not compile when successRate < 0.7 (recent, no decay benefit)', () => {
    const { store } = freshStore()
    // 1 success + 1 failure, both recent → rate 0.5
    const res = compileDecisions([obs('k', true, NOW), obs('k', false, NOW)], store, { now: NOW })
    expect(res.compiled).toBe(0)
    expect(store.get('k')).toBeNull()
  })

  // AC3: GIVEN aged records WHEN compile runs THEN decay reduces their contribution
  it('lets decay discount an old failure so a reinforced recent success compiles', () => {
    const { store } = freshStore()
    const recentSuccess = obs('k', true, NOW)
    const oldFailure = obs('k', false, NOW - 200 * DAY) // >> τ(30d) → weight ≈ 0
    const res = compileDecisions([recentSuccess, oldFailure], store, { now: NOW })
    expect(res.compiled).toBe(1)
    expect(store.get('k')?.successRate).toBeGreaterThan(0.9)
  })

  it('without decay the same old failure would block compilation (control)', () => {
    const { store } = freshStore()
    const res = compileDecisions(
      [obs('k', true, NOW), obs('k', false, NOW - 200 * DAY)],
      store,
      { now: NOW, tauMs: Number.POSITIVE_INFINITY }, // disable decay → both weigh 1 → rate 0.5
    )
    expect(res.compiled).toBe(0)
  })

  it('compiles independent keys independently and reports counts', () => {
    const { store } = freshStore()
    const res = compileDecisions([obs('a', true, NOW), obs('a', true, NOW), obs('b', true, NOW)], store, { now: NOW })
    expect(res.compiled).toBe(1) // only 'a' has >= 2
    expect(res.skipped).toBe(1) // 'b' has 1
    expect(store.get('a')).not.toBeNull()
    expect(store.get('b')).toBeNull()
  })
})
