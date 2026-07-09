/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Task 3.4: Tests for scenario-runner.ts and scorecard.ts.
 * AC1 — buildScorecard computes correct resolveRate for 2/3 resolved.
 * AC2 — buildScorecard with empty input returns zeroed scorecard.
 * AC3 — buildScorecard with all resolved yields resolveRate = 1.0.
 */

import { describe, it, expect } from 'vitest'
import { buildScorecard, type ScenarioResult } from '../core/evals/scorecard.js'

// ── Fixture factory ───────────────────────────────────────────────────────────

function makeResult(overrides: Partial<ScenarioResult> = {}): ScenarioResult {
  return {
    id: 'scenario-1',
    tier: 'build',
    model: 'test-model',
    resolved: true,
    testsPassed: true,
    done: true,
    tokensIn: 100,
    tokensOut: 50,
    tokensTotal: 150,
    cachedTokensIn: 0,
    costUsd: 0.001,
    attempts: 1,
    durationMs: 100,
    stopped: 'done',
    qualityScore: 1.0,
    ...overrides,
  }
}

// ── AC1 — 2 passing, 1 failing → resolveRate ≈ 0.667 ─────────────────────────

describe('buildScorecard: 2 passing + 1 failing scenarios', () => {
  it('computes resolveRate of ~0.667 for 2/3 resolved', () => {
    const results: ScenarioResult[] = [
      makeResult({ id: 's1', resolved: true }),
      makeResult({ id: 's2', resolved: true }),
      makeResult({ id: 's3', resolved: false }),
    ]
    const scorecard = buildScorecard(results)
    expect(scorecard.total).toBe(3)
    expect(scorecard.resolved).toBe(2)
    expect(scorecard.resolveRate).toBeCloseTo(2 / 3, 3)
  })

  it('sets total to 3 and resolved to 2', () => {
    const results: ScenarioResult[] = [
      makeResult({ id: 's1', resolved: true }),
      makeResult({ id: 's2', resolved: true }),
      makeResult({ id: 's3', resolved: false }),
    ]
    const scorecard = buildScorecard(results)
    expect(scorecard.total).toBe(3)
    expect(scorecard.resolved).toBe(2)
  })
})

// ── AC2 — no scenarios → zeroed scorecard ────────────────────────────────────

describe('buildScorecard: empty input', () => {
  it('returns total=0, resolved=0, resolveRate=0 for empty array', () => {
    const scorecard = buildScorecard([])
    expect(scorecard.total).toBe(0)
    expect(scorecard.resolved).toBe(0)
    expect(scorecard.resolveRate).toBe(0)
  })

  it('returns costPerResolvedUsd=null for empty input', () => {
    const scorecard = buildScorecard([])
    expect(scorecard.costPerResolvedUsd).toBeNull()
  })

  it('does not throw on empty array', () => {
    expect(() => buildScorecard([])).not.toThrow()
  })
})

// ── AC3 — all resolved → resolveRate = 1.0 ───────────────────────────────────

describe('buildScorecard: all scenarios resolved', () => {
  it('resolveRate = 1.0 when all scenarios pass', () => {
    const results: ScenarioResult[] = [
      makeResult({ id: 's1', resolved: true }),
      makeResult({ id: 's2', resolved: true }),
      makeResult({ id: 's3', resolved: true }),
    ]
    const scorecard = buildScorecard(results)
    expect(scorecard.resolveRate).toBe(1.0)
    expect(scorecard.resolved).toBe(3)
    expect(scorecard.total).toBe(3)
  })

  it('costPerResolvedUsd is non-null and positive when all resolved with cost > 0', () => {
    const results: ScenarioResult[] = [
      makeResult({ id: 's1', resolved: true, costUsd: 0.003 }),
      makeResult({ id: 's2', resolved: true, costUsd: 0.002 }),
    ]
    const scorecard = buildScorecard(results)
    expect(scorecard.costPerResolvedUsd).not.toBeNull()
    expect(scorecard.costPerResolvedUsd!).toBeGreaterThan(0)
  })
})
