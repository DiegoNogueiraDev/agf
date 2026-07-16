import { describe, it, expect } from 'vitest'
import { buildScorecard, formatScorecard } from '../core/evals/scorecard.js'
import type { ScenarioResult } from '../core/evals/scorecard.js'

function makeResult(overrides: Partial<ScenarioResult> = {}): ScenarioResult {
  return {
    scenarioId: 's1',
    model: 'claude-sonnet-4-6',
    tier: 'build',
    resolved: true,
    tokensIn: 1000,
    tokensOut: 200,
    tokensTotal: 1200,
    cachedTokensIn: 0,
    costUsd: 0.002,
    attempts: 1,
    durationMs: 1500,
    stopped: 'end_turn',
    qualityScore: 0.9,
    ...overrides,
  } as ScenarioResult
}

describe('buildScorecard', () => {
  it('returns scorecard with total=0 for empty results', () => {
    const sc = buildScorecard([])
    expect(sc.total).toBe(0)
    expect(sc.resolved).toBe(0)
  })

  it('counts total and resolved scenarios', () => {
    const results = [makeResult({ resolved: true }), makeResult({ resolved: false }), makeResult({ resolved: true })]
    const sc = buildScorecard(results)
    expect(sc.total).toBe(3)
    expect(sc.resolved).toBe(2)
  })

  it('computes overall resolve rate', () => {
    const results = [makeResult({ resolved: true }), makeResult({ resolved: false })]
    const sc = buildScorecard(results)
    expect(sc.resolveRate).toBeCloseTo(0.5)
  })

  it('aggregates by tier', () => {
    const results = [makeResult({ tier: 'cheap', resolved: true }), makeResult({ tier: 'build', resolved: false })]
    const sc = buildScorecard(results)
    expect(Array.isArray(sc.byTier)).toBe(true)
    const cheapTier = sc.byTier.find((t) => t.tier === 'cheap')
    expect(cheapTier).toBeDefined()
    expect(cheapTier!.total).toBe(1)
    expect(cheapTier!.resolved).toBe(1)
  })

  it('aggregates by model', () => {
    const results = [
      makeResult({ model: 'model-a', resolved: true }),
      makeResult({ model: 'model-b', resolved: false }),
    ]
    const sc = buildScorecard(results)
    const modelA = sc.byModel.find((m) => m.model === 'model-a')
    expect(modelA).toBeDefined()
    expect(modelA!.resolveRate).toBe(1)
  })

  it('totalCostUsd sums all costs', () => {
    const results = [makeResult({ costUsd: 0.01 }), makeResult({ costUsd: 0.02 })]
    const sc = buildScorecard(results)
    expect(sc.totalCostUsd).toBeCloseTo(0.03)
  })
})

describe('formatScorecard', () => {
  it('returns an array of strings', () => {
    const sc = buildScorecard([makeResult()])
    const lines = formatScorecard(sc)
    expect(Array.isArray(lines)).toBe(true)
    expect(lines.length).toBeGreaterThan(0)
  })

  it('each line is a string', () => {
    const sc = buildScorecard([makeResult()])
    const lines = formatScorecard(sc)
    for (const line of lines) {
      expect(typeof line).toBe('string')
    }
  })
})

describe('TierAgg tokens-vs-resolve (AC1, AC2)', () => {
  it('avgTokensResolved is avg tokens for resolved scenarios in tier (AC1)', () => {
    const sc = buildScorecard([
      makeResult({ tier: 'T0', resolved: true, tokensTotal: 1000 }),
      makeResult({ tier: 'T0', resolved: true, tokensTotal: 2000 }),
      makeResult({ tier: 'T0', resolved: false, tokensTotal: 3000 }),
    ])
    const tier = sc.byTier.find((t) => t.tier === 'T0')!
    expect(tier.avgTokensResolved).toBeCloseTo(1500)
  })

  it('avgTokensFailed is avg tokens for unresolved scenarios in tier (AC1)', () => {
    const sc = buildScorecard([
      makeResult({ tier: 'T0', resolved: true, tokensTotal: 1000 }),
      makeResult({ tier: 'T0', resolved: false, tokensTotal: 3000 }),
      makeResult({ tier: 'T0', resolved: false, tokensTotal: 5000 }),
    ])
    const tier = sc.byTier.find((t) => t.tier === 'T0')!
    expect(tier.avgTokensFailed).toBeCloseTo(4000)
  })

  it('tokensWastedOnFailures is sum of tokens for unresolved scenarios (AC1)', () => {
    const sc = buildScorecard([
      makeResult({ tier: 'T0', resolved: true, tokensTotal: 1000 }),
      makeResult({ tier: 'T0', resolved: false, tokensTotal: 3000 }),
      makeResult({ tier: 'T0', resolved: false, tokensTotal: 5000 }),
    ])
    const tier = sc.byTier.find((t) => t.tier === 'T0')!
    expect(tier.tokensWastedOnFailures).toBe(8000)
  })

  it('tokensWastedOnFailures === 0 when all resolved (AC2)', () => {
    const sc = buildScorecard([
      makeResult({ tier: 'T0', resolved: true, tokensTotal: 1000 }),
      makeResult({ tier: 'T0', resolved: true, tokensTotal: 2000 }),
    ])
    const tier = sc.byTier.find((t) => t.tier === 'T0')!
    expect(tier.tokensWastedOnFailures).toBe(0)
  })

  it('avgTokensResolved is null when no resolved scenarios in tier', () => {
    const sc = buildScorecard([makeResult({ tier: 'T0', resolved: false, tokensTotal: 5000 })])
    const tier = sc.byTier.find((t) => t.tier === 'T0')!
    expect(tier.avgTokensResolved).toBeNull()
  })

  it('avgTokensFailed is null when no failed scenarios in tier', () => {
    const sc = buildScorecard([makeResult({ tier: 'T0', resolved: true, tokensTotal: 1000 })])
    const tier = sc.byTier.find((t) => t.tier === 'T0')!
    expect(tier.avgTokensFailed).toBeNull()
  })
})

describe('ModelAgg resolve% × costPerSuccess', () => {
  it('model row exposes resolveRate, totalCostUsd and costPerSuccess', () => {
    const sc = buildScorecard([
      makeResult({ model: 'model-a', resolved: true, costUsd: 0.01 }),
      makeResult({ model: 'model-a', resolved: false, costUsd: 0.01 }),
    ])
    const row = sc.byModel.find((m) => m.model === 'model-a')!
    expect(row.resolveRate).toBeCloseTo(0.5)
    expect(row.totalCostUsd).toBeCloseTo(0.02)
    expect(row.costPerSuccess).toBeCloseTo(0.02) // 0.02 / 1 resolved
  })

  it('costPerSuccess is null (NA) when 0 successes — no divide-by-zero', () => {
    const sc = buildScorecard([makeResult({ model: 'zero-model', resolved: false, costUsd: 0.05 })])
    const row = sc.byModel.find((m) => m.model === 'zero-model')!
    expect(row.costPerSuccess).toBeNull()
  })
})
