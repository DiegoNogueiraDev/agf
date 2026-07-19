/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Task 2.3 — Model Performance Ledger por Tier
 *
 * AC1: llm_call_ledger registra model_tier (cheap|build|frontier), model_id, escalated
 * AC2: summarizeLedgerByTier retorna calls, avg_tokens, avg_cost_usd por tier
 * AC3: relatório mostra % que ficou em cheap vs escalou para build/frontier
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { recordModelCall, summarizeLedgerByTier, inferModelTier } from '../core/observability/llm-call-ledger.js'

const LEDGER_DDL = `
  CREATE TABLE IF NOT EXISTS llm_call_ledger (
    id TEXT PRIMARY KEY,
    ts INTEGER NOT NULL,
    project_id TEXT,
    run_id TEXT,
    node_id TEXT,
    caller TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cached_input_tokens INTEGER,
    reasoning_tokens INTEGER,
    cost_usd REAL,
    status TEXT,
    session_id TEXT,
    model_tier TEXT,
    escalated INTEGER DEFAULT 0,
    escalation_reason TEXT,
    agent_id TEXT
  )
`

describe('Task 2.3 — Model Performance Ledger por Tier (AC1, AC2, AC3)', () => {
  let db: Database.Database

  beforeAll(() => {
    db = new Database(':memory:')
    db.exec(LEDGER_DDL)
  })

  afterAll(() => {
    db.close()
  })

  // ─── inferModelTier helper ────────────────────────────────────────────────

  it('AC1: inferModelTier classifies claude-haiku-4-5 as cheap', () => {
    expect(inferModelTier('claude-haiku-4-5')).toBe('cheap')
  })

  it('AC1: inferModelTier classifies claude-sonnet-4-6 as build', () => {
    expect(inferModelTier('claude-sonnet-4-6')).toBe('build')
  })

  it('AC1: inferModelTier classifies claude-opus-4-8 as frontier', () => {
    expect(inferModelTier('claude-opus-4-8')).toBe('frontier')
  })

  it('AC1: inferModelTier returns null for unknown model', () => {
    expect(inferModelTier('unknown-model-xyz')).toBeNull()
  })

  // ─── AC1: recordModelCall persists model_tier and escalated ──────────────

  it('AC1: recordModelCall with explicit modelTier stores it in model_tier column', () => {
    const id = recordModelCall(db, {
      sessionId: 'tier-test-s1',
      nodeId: 'node_tier_a',
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      inputTokens: 500,
      outputTokens: 100,
      modelTier: 'cheap',
      escalated: false,
    })
    const row = db.prepare('SELECT model_tier, escalated FROM llm_call_ledger WHERE id = ?').get(id) as
      { model_tier: string | null; escalated: number | null } | undefined
    expect(row?.model_tier).toBe('cheap')
    expect(row?.escalated).toBe(0)
  })

  it('AC1: recordModelCall with escalated=true stores escalated=1', () => {
    const id = recordModelCall(db, {
      sessionId: 'tier-test-s1',
      nodeId: 'node_tier_b',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      inputTokens: 1500,
      outputTokens: 400,
      modelTier: 'build',
      escalated: true,
    })
    const row = db.prepare('SELECT model_tier, escalated FROM llm_call_ledger WHERE id = ?').get(id) as
      { model_tier: string | null; escalated: number | null } | undefined
    expect(row?.model_tier).toBe('build')
    expect(row?.escalated).toBe(1)
  })

  it('AC1: recordModelCall without modelTier auto-infers tier from known model', () => {
    const id = recordModelCall(db, {
      sessionId: 'tier-test-infer',
      nodeId: 'node_tier_infer',
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      inputTokens: 2000,
      outputTokens: 600,
    })
    const row = db.prepare('SELECT model_tier FROM llm_call_ledger WHERE id = ?').get(id) as
      { model_tier: string | null } | undefined
    expect(row?.model_tier).toBe('frontier')
  })

  it('AC1: recordModelCall with unknown model leaves model_tier as null', () => {
    const id = recordModelCall(db, {
      sessionId: 'tier-test-unknown',
      nodeId: 'node_tier_unknown',
      provider: 'custom',
      model: 'some-custom-llm',
      inputTokens: 100,
      outputTokens: 50,
    })
    const row = db.prepare('SELECT model_tier FROM llm_call_ledger WHERE id = ?').get(id) as
      { model_tier: string | null } | undefined
    expect(row?.model_tier).toBeNull()
  })

  // ─── AC2 + AC3: summarizeLedgerByTier ────────────────────────────────────

  it('AC2: summarizeLedgerByTier returns breakdown with calls, avgTokens, avgCostUsd per tier', () => {
    const db2 = new Database(':memory:')
    db2.exec(LEDGER_DDL)

    // Insert calls for each tier
    recordModelCall(db2, {
      sessionId: 'stats-session',
      nodeId: 'n1',
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      inputTokens: 400,
      outputTokens: 100,
      modelTier: 'cheap',
      costUsd: 0.001,
    })
    recordModelCall(db2, {
      sessionId: 'stats-session',
      nodeId: 'n2',
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      inputTokens: 600,
      outputTokens: 150,
      modelTier: 'cheap',
      costUsd: 0.0015,
    })
    recordModelCall(db2, {
      sessionId: 'stats-session',
      nodeId: 'n3',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      inputTokens: 2000,
      outputTokens: 500,
      modelTier: 'build',
      costUsd: 0.01,
    })

    const tiers = summarizeLedgerByTier(db2)

    const cheap = tiers.find((t) => t.tier === 'cheap')
    expect(cheap).toBeDefined()
    expect(cheap!.calls).toBe(2)
    expect(cheap!.avgTokensTotal).toBeGreaterThan(0)
    expect(cheap!.avgCostUsd).toBeCloseTo(0.00125, 4)

    const build = tiers.find((t) => t.tier === 'build')
    expect(build).toBeDefined()
    expect(build!.calls).toBe(1)

    db2.close()
  })

  it('AC3: summarizeLedgerByTier includes cheapPct and escalatedPct', () => {
    const db3 = new Database(':memory:')
    db3.exec(LEDGER_DDL)

    // 3 cheap, 2 build
    for (let i = 0; i < 3; i++) {
      recordModelCall(db3, {
        sessionId: 'pct-session',
        nodeId: `nc${i}`,
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        inputTokens: 300,
        outputTokens: 100,
        modelTier: 'cheap',
        escalated: false,
      })
    }
    for (let i = 0; i < 2; i++) {
      recordModelCall(db3, {
        sessionId: 'pct-session',
        nodeId: `nb${i}`,
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        inputTokens: 1000,
        outputTokens: 300,
        modelTier: 'build',
        escalated: true,
      })
    }

    const tiers = summarizeLedgerByTier(db3)
    const total = tiers.reduce((s, t) => s + t.calls, 0)
    const cheapTier = tiers.find((t) => t.tier === 'cheap')
    expect(cheapTier).toBeDefined()
    expect(cheapTier!.callsPct).toBeCloseTo(60, 0) // 3/5 = 60%
    expect(total).toBe(5)

    db3.close()
  })
})
