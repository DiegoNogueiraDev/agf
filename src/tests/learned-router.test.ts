/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { recordModelCall } from '../core/observability/llm-call-ledger.js'
import { insertEpisodicOutcome, type EpisodicOutcomeResult } from '../core/store/episodic-outcomes-store.js'
import { summarizeByLever } from '../core/economy/economy-lever-ledger.js'
import { setLeverEnabled } from '../core/economy/economy-levers-config.js'
import { routeModelForProvider, tierForTask, type ModelTier, type RouterConfig } from '../core/model-hub/tier-router.js'
import { aggregateArmStats, representativeTierCostUsd } from '../core/model-hub/arm-stats-store.js'
import { routeTierLearned, recordLearnedDecision, type LearnedRouterDeps } from '../core/model-hub/learned-router.js'

const TIER_MODEL: Record<ModelTier, string> = {
  cheap: 'claude-haiku-4-5',
  build: 'claude-sonnet-4-6',
  frontier: 'claude-opus-4-8',
}
const TIER_COST: Record<ModelTier, number> = { cheap: 0.001, build: 0.02, frontier: 0.1 }

let store: SqliteStore
let seq = 0

function seed(taskType: string, tier: ModelTier, outcome: EpisodicOutcomeResult, costUsd = TIER_COST[tier]): string {
  const nodeId = `n_${seq++}`
  recordModelCall(store.getDb(), {
    sessionId: 'sess',
    nodeId,
    provider: 'anthropic',
    model: TIER_MODEL[tier],
    inputTokens: 1000,
    outputTokens: 300,
    costUsd,
    modelTier: tier,
  })
  insertEpisodicOutcome(store.getDb(), {
    id: `e_${nodeId}`,
    nodeId,
    taskType,
    tags: taskType,
    approachSummary: 'x',
    outcome,
    cycleTimeDelta: 0,
    reopenCount: outcome === 'success' ? 0 : 2,
    createdAt: Date.now(),
  })
  return nodeId
}

function deps(routerConfig: RouterConfig = { mode: 'auto' }, providerId?: string): LearnedRouterDeps {
  return { db: store.getDb(), leversSource: store, routerConfig, providerId }
}

beforeEach(() => {
  store = SqliteStore.open(':memory:')
  store.initProject('learned-router-test')
  seq = 0
})

describe('learned-router — lever OFF is byte-identical to the heuristic', () => {
  it('delegates verbatim to routeModelForProvider and reports no recommendation', () => {
    const r = routeTierLearned(deps(), { kind: 'implement' })
    expect(r.source).toBe('lever-off')
    expect(r.tier).toBe(tierForTask('implement'))
    expect(r.model).toBe(routeModelForProvider({ mode: 'auto' }, 'implement', undefined, undefined))
    expect(r.recommendation).toBeUndefined()
  })

  it('never overrides a pinned model even with the lever ON', () => {
    setLeverEnabled(store, 'learned_routing', true)
    const pinned: RouterConfig = { mode: 'pinned', modelId: 'claude-opus-4-8' }
    const r = routeTierLearned(deps(pinned), { kind: 'implement' })
    expect(r.model).toBe('claude-opus-4-8')
    expect(r.source).toBe('lever-off')
  })
})

describe('learned-router — SQL aggregation (episodic ⋈ ledger, additive, no migration)', () => {
  it('aggregates pulls/successes/meanCost per (taskType, tier)', () => {
    seed('implement', 'cheap', 'success')
    seed('implement', 'cheap', 'failure')
    seed('implement', 'build', 'success')
    const arms = aggregateArmStats(store.getDb(), { taskType: 'implement' })
    const cheap = arms.find((a) => a.tier === 'cheap')!
    expect(cheap.pulls).toBe(2)
    expect(cheap.successes).toBe(1)
    expect(cheap.meanCostUsd).toBeCloseTo(0.001, 6)
    expect(arms.find((a) => a.tier === 'build')!.successes).toBe(1)
  })

  it('excludes ledger rows with a null model_tier (cannot map to a tier)', () => {
    const nodeId = 'n_null'
    recordModelCall(store.getDb(), {
      sessionId: 's',
      nodeId,
      provider: 'x',
      model: 'totally-unknown-model',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0.5,
      modelTier: undefined, // inferModelTier returns null for unknown → grouped as '(unknown)'
    })
    insertEpisodicOutcome(store.getDb(), {
      id: 'e_null',
      nodeId,
      taskType: 'implement',
      tags: 'implement',
      approachSummary: 'x',
      outcome: 'success',
      cycleTimeDelta: 0,
      reopenCount: 0,
      createdAt: Date.now(),
    })
    expect(aggregateArmStats(store.getDb(), { taskType: 'implement' })).toHaveLength(0)
  })

  it('counts a node once even with several ledger rows (fan-out guard)', () => {
    const nodeId = seed('implement', 'cheap', 'success')
    // two extra calls (retries) for the same node
    recordModelCall(store.getDb(), {
      sessionId: 's',
      nodeId,
      provider: 'a',
      model: TIER_MODEL.cheap,
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0.001,
      modelTier: 'cheap',
    })
    recordModelCall(store.getDb(), {
      sessionId: 's',
      nodeId,
      provider: 'a',
      model: TIER_MODEL.cheap,
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0.001,
      modelTier: 'cheap',
    })
    const cheap = aggregateArmStats(store.getDb(), { taskType: 'implement' }).find((a) => a.tier === 'cheap')!
    expect(cheap.pulls).toBe(1)
  })
})

describe('learned-router — lever ON', () => {
  it('cold-start with no evidence returns the heuristic tier', () => {
    setLeverEnabled(store, 'learned_routing', true)
    const r = routeTierLearned(deps(), { kind: 'implement', taskType: 'implement' })
    expect(r.source).toBe('cold-start')
    expect(r.tier).toBe(tierForTask('implement')) // 'build'
  })

  it('exploits a consistently cheaper, successful tier once all tiers are explored', () => {
    setLeverEnabled(store, 'learned_routing', true)
    for (let i = 0; i < 12; i++) seed('implement', 'cheap', 'success')
    for (let i = 0; i < 6; i++) seed('implement', 'build', 'success')
    for (let i = 0; i < 6; i++) seed('implement', 'frontier', 'success')
    const r = routeTierLearned(deps(), { kind: 'implement', taskType: 'implement' })
    expect(r.tier).toBe('cheap')
    expect(r.source).toBe('learned')
  })

  it('does not pick a flakier tier when cost is held constant (quality signal)', () => {
    setLeverEnabled(store, 'learned_routing', true)
    const flatCost = 0.02
    for (let i = 0; i < 12; i++) seed('implement', 'cheap', i < 2 ? 'success' : 'failure', flatCost)
    for (let i = 0; i < 12; i++) seed('implement', 'build', i < 11 ? 'success' : 'failure', flatCost)
    for (let i = 0; i < 8; i++) seed('implement', 'frontier', 'success', flatCost)
    const r = routeTierLearned(deps(), { kind: 'implement', taskType: 'implement' })
    expect(r.tier).not.toBe('cheap')
  })
})

describe('learned-router — ledger events (measured in economy_lever_ledger)', () => {
  it('records a passthrough (saved 0) when the learned tier equals the heuristic', () => {
    recordLearnedDecision(store.getDb(), { sessionId: 's', nodeId: 'n', heuristicTier: 'build', chosenTier: 'build' })
    const row = summarizeByLever(store.getDb()).find((l) => l.lever === 'learned_routing')!
    expect(row.totalSaved).toBe(0)
    expect(row.count).toBe(1)
  })

  it('records cost-avoided (saved > 0) when the learned tier is cheaper', () => {
    recordLearnedDecision(store.getDb(), {
      sessionId: 's',
      nodeId: 'n',
      heuristicTier: 'frontier',
      chosenTier: 'cheap',
    })
    const row = summarizeByLever(store.getDb()).find((l) => l.lever === 'learned_routing')!
    expect(row.totalSaved).toBeGreaterThan(0)
  })
})

describe('learned-router — representative cost fallback', () => {
  it('falls back to MODEL_PRICING when the ledger has no rows for a tier', () => {
    const cost = representativeTierCostUsd(store.getDb(), 'frontier')
    expect(Number.isFinite(cost)).toBe(true)
    expect(cost).toBeGreaterThan(0)
  })
})

describe('learned-router — provider-aware resolution', () => {
  it('resolves to the OpenRouter tier-map model when the provider is openrouter', () => {
    setLeverEnabled(store, 'learned_routing', true)
    const r = routeTierLearned(deps({ mode: 'auto' }, 'openrouter'), { kind: 'implement', taskType: 'implement' })
    // cold-start ⇒ heuristic tier 'build' ⇒ OpenRouter build model
    expect(r.model).toBe('meta-llama/llama-4-maverick')
  })
})
