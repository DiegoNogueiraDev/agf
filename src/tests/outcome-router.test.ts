/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import {
  armReward,
  ucb1Score,
  recommendTier,
  explainTierChoice,
  selectTierThompson,
  DEFAULT_BANDIT_CONFIG,
  type ArmStat,
} from '../core/model-hub/outcome-router.js'
import { MODEL_TIERS, tierForTask, PHASE_TIER_MAP, type ModelTier } from '../core/model-hub/tier-router.js'
import type { InternalPhase } from '../core/lifecycle/phase.js'

const arm = (tier: ModelTier, pulls: number, successes: number, meanCostUsd: number): ArmStat => ({
  taskType: 'implement',
  tier,
  pulls,
  successes,
  meanCostUsd,
})

describe('outcome-router — armReward (cost-per-success)', () => {
  it('rewards higher success rate at lower cost', () => {
    const good = armReward(arm('cheap', 10, 8, 0.001))
    const worse = armReward(arm('frontier', 10, 8, 0.05)) // same rate, 50x cost
    expect(good).toBeGreaterThan(worse)
  })

  it('never divides by zero when cost is 0 (uses costFloorUsd)', () => {
    const r = armReward(arm('cheap', 10, 8, 0))
    expect(Number.isFinite(r)).toBe(true)
    expect(r).toBeGreaterThan(0)
  })

  it('Laplace-smooths a zero-success arm to a positive reward', () => {
    const r = armReward(arm('cheap', 4, 0, 0.001))
    expect(r).toBeGreaterThan(0)
  })
})

describe('outcome-router — ucb1Score', () => {
  it('gives an under-sampled arm a larger exploration bonus than a saturated one', () => {
    const rare = ucb1Score(0.5, 1, 100, { explorationC: 2 })
    const saturated = ucb1Score(0.8, 50, 100, { explorationC: 2 })
    expect(rare).toBeGreaterThan(saturated)
  })

  it('is finite for an unplayed arm (n floored at 1)', () => {
    expect(Number.isFinite(ucb1Score(0.5, 0, 100))).toBe(true)
  })
})

describe('outcome-router — cold start defers to the heuristic prior (byte-identical default)', () => {
  it('returns the prior tier with empty evidence for every task kind', () => {
    for (const kind of ['classify', 'status', 'implement', 'review', 'plan'] as const) {
      const prior = tierForTask(kind)
      const rec = recommendTier([], prior)
      expect(rec.tier).toBe(prior)
      expect(rec.source).toBe('prior')
      expect(rec.reason).toBe('cold-start')
    }
  })

  it('returns the prior tier for every lifecycle phase', () => {
    for (const phase of Object.keys(PHASE_TIER_MAP) as InternalPhase[]) {
      const prior = PHASE_TIER_MAP[phase]
      expect(recommendTier([], prior).tier).toBe(prior)
    }
  })

  it('still defers to the prior with only a few samples (< minObservations)', () => {
    const stats = [arm('cheap', 2, 2, 0.001)] // 2 real pulls < default minObservations (5)
    const rec = recommendTier(stats, 'frontier')
    expect(rec.tier).toBe('frontier')
    expect(rec.source).toBe('prior')
  })
})

describe('outcome-router — exploit / explore once past cold start', () => {
  it('exploits a consistently cheaper, successful tier over the prior', () => {
    // All three tiers tried (no unplayed arm to force-explore); evidence favors cheap.
    const stats = [arm('cheap', 50, 48, 0.001), arm('build', 10, 5, 0.02), arm('frontier', 10, 9, 0.1)]
    const rec = recommendTier(stats, 'build') // prior says build; evidence says cheap
    expect(rec.tier).toBe('cheap')
    expect(rec.source).toBe('learned')
    expect(rec.reason).toBe('exploit')
  })

  it('explores an under-sampled arm when the exploration constant is large', () => {
    const stats = [
      arm('cheap', 80, 70, 0.001), // saturated prior, strong reward
      arm('build', 2, 2, 0.0009), // barely sampled, also good — big UCB bonus
      arm('frontier', 80, 75, 0.1), // saturated, expensive
    ]
    const rec = recommendTier(stats, 'cheap', { explorationC: 10 })
    expect(rec.tier).toBe('build')
    expect(rec.reason).toBe('explore')
  })

  it('a later failure penalizes an arm so it is not chosen (loop closes honestly)', () => {
    const stats = [
      arm('cheap', 20, 2, 0.001), // mostly failed despite being cheap
      arm('build', 20, 18, 0.02), // reliable
    ]
    const rec = recommendTier(stats, 'cheap')
    expect(rec.tier).not.toBe('cheap')
  })
})

describe('outcome-router — determinism', () => {
  it('produces identical output across repeated calls', () => {
    const stats = [arm('cheap', 30, 20, 0.001), arm('build', 30, 25, 0.02), arm('frontier', 30, 28, 0.1)]
    const first = JSON.stringify(recommendTier(stats, 'build'))
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(recommendTier(stats, 'build'))).toBe(first)
    }
  })

  it('prefers the prior tier when it ties at the top (no exploration bonus)', () => {
    // explorationC=0 ⇒ pure reward; the prior pseudocount makes the prior arm the
    // strict max, so it is chosen deterministically.
    const stats = MODEL_TIERS.map((t) => arm(t, 10, 8, 0.01))
    const rec = recommendTier(stats, 'build', { explorationC: 0 })
    expect(rec.tier).toBe('build')
  })

  it('breaks a genuine tie between non-prior arms by lowest tier index', () => {
    // cheap and build are identical & best; frontier (the prior) is worse ⇒ tie
    // between cheap/build resolved to the lower MODEL_TIERS index (cheap).
    const stats = [arm('cheap', 10, 9, 0.01), arm('build', 10, 9, 0.01), arm('frontier', 10, 1, 0.05)]
    const rec = recommendTier(stats, 'frontier', { explorationC: 0 })
    expect(rec.tier).toBe('cheap')
    expect(rec.reason).toBe('tie-break')
  })

  it('exposes a per-arm breakdown via explainTierChoice', () => {
    const stats = [arm('cheap', 30, 20, 0.001), arm('build', 30, 25, 0.02)]
    const rec = explainTierChoice(stats, 'build')
    expect(rec.arms).toHaveLength(MODEL_TIERS.length)
    expect(rec.arms.every((a) => Number.isFinite(a.ucb1) && Number.isFinite(a.reward))).toBe(true)
  })
})

describe('outcome-router — optional seeded Thompson sampling', () => {
  it('is reproducible for a fixed seed', () => {
    const stats = [arm('cheap', 50, 48, 0.001), arm('build', 30, 15, 0.02)]
    const a = selectTierThompson(stats, 'build', 42)
    const b = selectTierThompson(stats, 'build', 42)
    expect(a.tier).toBe(b.tier)
    expect(a.score).toBe(b.score)
  })

  it('defers to the prior at cold start regardless of seed', () => {
    expect(selectTierThompson([], 'frontier', 7).tier).toBe('frontier')
    expect(selectTierThompson([arm('cheap', 1, 1, 0.001)], 'build', 99).source).toBe('prior')
  })

  it('default config keeps the deterministic UCB1 algorithm', () => {
    expect(DEFAULT_BANDIT_CONFIG.algorithm).toBe('ucb1')
  })
})
