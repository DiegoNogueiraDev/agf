/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_238a1de503c6 — the ledger quantifies the economy↔latency tier trade.
 * computeTierTrade is pure; collectTierTrade reads the REAL ledger (model_tier +
 * cost_usd) and per-tier node cycle-times, tolerating an absent ledger (AC2).
 */

import { describe, it, expect } from 'vitest'
import { computeTierTrade, collectTierTrade, type TierTradeRow } from '../core/evals/tier-trade.js'
import { collectVelocityScorecard } from '../core/evals/scorecard.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { recordModelCall } from '../core/observability/llm-call-ledger.js'
import type { GraphNode } from '../core/graph/graph-types.js'

const HOURS_MS = 3_600_000

describe('computeTierTrade — frontier↔cheap delta (pure)', () => {
  it('quantifies economy sacrificed and latency gained when frontier is dearer but faster', () => {
    const rows: TierTradeRow[] = [
      { tier: 'cheap', costUsd: 0.01, avgCycleTimeHours: 5, tasks: 3 },
      { tier: 'frontier', costUsd: 0.1, avgCycleTimeHours: 2, tasks: 2 },
    ]
    const trade = computeTierTrade(rows)
    expect(trade.economySacrificedUsd).toBeCloseTo(0.09, 6) // 0.10 - 0.01
    expect(trade.latencyGainedHours).toBeCloseTo(3, 2) // 5 - 2
    expect(trade.note).toBeUndefined()
  })

  it('sorts byTier deterministically by tier name', () => {
    const rows: TierTradeRow[] = [
      { tier: 'frontier', costUsd: 0.1, avgCycleTimeHours: 2, tasks: 1 },
      { tier: 'cheap', costUsd: 0.01, avgCycleTimeHours: 5, tasks: 1 },
    ]
    expect(computeTierTrade(rows).byTier.map((r) => r.tier)).toEqual(['cheap', 'frontier'])
  })

  it('returns a note and zero deltas when a tier is missing (not quantifiable)', () => {
    const trade = computeTierTrade([{ tier: 'cheap', costUsd: 0.01, avgCycleTimeHours: 5, tasks: 1 }])
    expect(trade.economySacrificedUsd).toBe(0)
    expect(trade.latencyGainedHours).toBe(0)
    expect(trade.note).toBeTruthy()
  })
})

function storeWithDoneNode(store: SqliteStore, id: string, cycleHours: number): void {
  const created = new Date('2026-07-01T00:00:00.000Z')
  const updated = new Date(created.getTime() + cycleHours * HOURS_MS)
  store.insertNode({
    id,
    type: 'task',
    title: id,
    status: 'done',
    priority: 2,
    acceptanceCriteria: [],
    tags: [],
    createdAt: created.toISOString(),
    updatedAt: updated.toISOString(),
  } as GraphNode)
}

describe('collectTierTrade — reads the real ledger + node cycle times', () => {
  it('attributes each done node to its dearest tier and computes the trade (AC1)', () => {
    const store = SqliteStore.open(':memory:')
    store.initProject('tier-trade-test')
    const db = store.getDb()
    // cheap node: 6h cycle, $0.01; frontier node: 2h cycle, $0.10
    storeWithDoneNode(store, 'node_cheap', 6)
    storeWithDoneNode(store, 'node_frontier', 2)
    recordModelCall(db, {
      sessionId: 's',
      nodeId: 'node_cheap',
      provider: 'openrouter',
      model: 'x',
      inputTokens: 10,
      outputTokens: 10,
      costUsd: 0.01,
      modelTier: 'cheap',
    })
    recordModelCall(db, {
      sessionId: 's',
      nodeId: 'node_frontier',
      provider: 'openrouter',
      model: 'y',
      inputTokens: 10,
      outputTokens: 10,
      costUsd: 0.1,
      modelTier: 'frontier',
    })
    const trade = collectTierTrade(store)
    store.close()
    expect(trade).not.toBeNull()
    expect(trade!.economySacrificedUsd).toBeCloseTo(0.09, 6)
    expect(trade!.latencyGainedHours).toBeCloseTo(4, 2) // cheap 6h - frontier 2h
    const frontierRow = trade!.byTier.find((r) => r.tier === 'frontier')
    expect(frontierRow?.avgCycleTimeHours).toBeCloseTo(2, 2)
  })

  it('logs and returns null when the ledger is unavailable — run not aborted (AC2)', () => {
    const store = SqliteStore.open(':memory:')
    store.initProject('tier-trade-fail')
    store.getDb().exec('DROP TABLE llm_call_ledger')
    // Must not throw — the trade is simply unrecorded.
    let trade: unknown
    expect(() => {
      trade = collectTierTrade(store)
    }).not.toThrow()
    store.close()
    expect(trade).toBeNull()
  })

  it('surfaces the tier trade in the E1 velocity scorecard (consumer wire)', () => {
    const store = SqliteStore.open(':memory:')
    store.initProject('tier-trade-e1')
    storeWithDoneNode(store, 'node_c', 6)
    storeWithDoneNode(store, 'node_f', 2)
    const db = store.getDb()
    recordModelCall(db, {
      sessionId: 's',
      nodeId: 'node_c',
      provider: 'o',
      model: 'x',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0.01,
      modelTier: 'cheap',
    })
    recordModelCall(db, {
      sessionId: 's',
      nodeId: 'node_f',
      provider: 'o',
      model: 'y',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0.1,
      modelTier: 'frontier',
    })
    const sc = collectVelocityScorecard(store)
    store.close()
    expect(sc.tierTrade).toBeTruthy()
    expect(sc.tierTrade!.economySacrificedUsd).toBeCloseTo(0.09, 6)
  })
})
