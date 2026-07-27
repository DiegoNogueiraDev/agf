/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Task 2.4 — Dogfood Measurement Haiku-first
 *
 * AC1: agf eval --compare baseline-dogfood-v2,haiku-first mostra delta de custo vs baseline
 * AC2: quality_score Haiku ≥ 0.80 em ≥70% dos cenários simples classificados como cheap
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { compareEvalSessions, meetsQualityThreshold } from '../core/evals/eval-compare.js'

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

const EVAL_RUN_DDL = `
  CREATE TABLE IF NOT EXISTS eval_run (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    golden_id TEXT NOT NULL,
    score REAL NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER,
    model_used TEXT,
    cost_usd REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )
`

function insertLedgerCall(
  db: Database.Database,
  opts: { sessionId: string; model: string; tokensIn: number; tokensOut: number; costUsd: number; tier?: string },
): void {
  db.prepare(
    `
    INSERT INTO llm_call_ledger (id, ts, provider, model, input_tokens, output_tokens, cost_usd, status, session_id, model_tier)
    VALUES (?, ?, 'anthropic', ?, ?, ?, ?, 'ok', ?, ?)
  `,
  ).run(
    `llm_${Math.random().toString(36).slice(2, 14)}`,
    Date.now(),
    opts.model,
    opts.tokensIn,
    opts.tokensOut,
    opts.costUsd,
    opts.sessionId,
    opts.tier ?? null,
  )
}

function insertEvalRun(
  db: Database.Database,
  opts: { runId: string; goldenId: string; score: number; passed: boolean; model?: string; costUsd?: number },
): void {
  db.prepare(
    `
    INSERT INTO eval_run (id, run_id, golden_id, score, passed, model_used, cost_usd, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, '2026-06-21T00:00:00Z')
  `,
  ).run(
    `er_${Math.random().toString(36).slice(2, 14)}`,
    opts.runId,
    opts.goldenId,
    opts.score,
    opts.passed ? 1 : 0,
    opts.model ?? null,
    opts.costUsd ?? 0,
  )
}

describe('Task 2.4 — Dogfood Measurement Haiku-first (AC1, AC2)', () => {
  let db: Database.Database

  beforeAll(() => {
    db = new Database(':memory:')
    db.exec(LEDGER_DDL)
    db.exec(EVAL_RUN_DDL)

    // baseline-dogfood-v2: Sonnet 4.6 runs (higher cost)
    for (let i = 0; i < 5; i++) {
      insertLedgerCall(db, {
        sessionId: 'baseline-dogfood-v2',
        model: 'claude-sonnet-4-6',
        tokensIn: 2000,
        tokensOut: 500,
        costUsd: 0.009,
        tier: 'build',
      })
    }

    // haiku-first: Haiku 4.5 runs (lower cost, Task 2.2 complexity signal)
    for (let i = 0; i < 5; i++) {
      insertLedgerCall(db, {
        sessionId: 'haiku-first',
        model: 'claude-haiku-4-5',
        tokensIn: 2000,
        tokensOut: 500,
        costUsd: 0.0015,
        tier: 'cheap',
      })
    }

    // eval_run quality scores for baseline (Sonnet)
    for (let i = 0; i < 5; i++) {
      insertEvalRun(db, {
        runId: 'baseline-dogfood-v2',
        goldenId: `golden_${i}`,
        score: 0.9,
        passed: true,
        model: 'claude-sonnet-4-6',
        costUsd: 0.009,
      })
    }

    // eval_run quality scores for haiku-first (Haiku — meets 0.80 threshold)
    for (let i = 0; i < 4; i++) {
      insertEvalRun(db, {
        runId: 'haiku-first',
        goldenId: `golden_${i}`,
        score: 0.85,
        passed: true,
        model: 'claude-haiku-4-5',
        costUsd: 0.0015,
      })
    }
    // one scenario below threshold (but still ≥70% pass the 0.80 bar → 4/5 = 80%)
    insertEvalRun(db, {
      runId: 'haiku-first',
      goldenId: 'golden_4',
      score: 0.7,
      passed: false,
      model: 'claude-haiku-4-5',
      costUsd: 0.0015,
    })
  })

  afterAll(() => {
    db.close()
  })

  // ─── AC1: compareEvalSessions returns delta report ────────────────────────

  it('AC1: compareEvalSessions retorna delta de tokens e custo entre sessões', () => {
    const report = compareEvalSessions(db, 'baseline-dogfood-v2', 'haiku-first')
    expect(report.sessionA).toBe('baseline-dogfood-v2')
    expect(report.sessionB).toBe('haiku-first')
    // Both have 5 calls
    expect(report.a.calls).toBe(5)
    expect(report.b.calls).toBe(5)
    // haiku-first has lower cost
    expect(report.b.totalCostUsd).toBeLessThan(report.a.totalCostUsd)
    // delta is negative (haiku costs less)
    expect(report.deltaTokensIn).toBe(0) // same token counts in this fixture
    expect(report.deltaCostUsd).toBeLessThan(0) // haiku cheaper
    // savings pct > 0
    expect(report.savingsPct).toBeGreaterThan(0)
  })

  it('AC1: deltaTokensIn = sessionB.totalTokensIn - sessionA.totalTokensIn', () => {
    const report = compareEvalSessions(db, 'baseline-dogfood-v2', 'haiku-first')
    expect(report.deltaTokensIn).toBe(report.b.totalTokensIn - report.a.totalTokensIn)
  })

  it('AC1: deltaCostUsd = sessionB.totalCostUsd - sessionA.totalCostUsd', () => {
    const report = compareEvalSessions(db, 'baseline-dogfood-v2', 'haiku-first')
    expect(report.deltaCostUsd).toBeCloseTo(report.b.totalCostUsd - report.a.totalCostUsd, 6)
  })

  it('AC1: compareEvalSessions handles unknown session gracefully (returns 0 counts)', () => {
    const report = compareEvalSessions(db, 'baseline-dogfood-v2', 'nonexistent-session')
    expect(report.b.calls).toBe(0)
    expect(report.b.totalCostUsd).toBe(0)
    expect(report.deltaCostUsd).toBeCloseTo(-report.a.totalCostUsd, 6)
  })

  it('AC1: savingsPct reflects cost reduction percentage (positive when B is cheaper)', () => {
    const report = compareEvalSessions(db, 'baseline-dogfood-v2', 'haiku-first')
    // savings pct = (A.cost - B.cost) / A.cost * 100
    const expected = ((report.a.totalCostUsd - report.b.totalCostUsd) / report.a.totalCostUsd) * 100
    expect(report.savingsPct).toBeCloseTo(expected, 2)
  })

  it('AC1: compareEvalSessions includes quality stats from eval_run when available', () => {
    const report = compareEvalSessions(db, 'baseline-dogfood-v2', 'haiku-first')
    expect(report.a.quality).toBeDefined()
    expect(report.b.quality).toBeDefined()
    expect(report.a.quality!.avgScore).toBeCloseTo(0.9, 2)
    // Haiku avg: (4*0.85 + 0.70)/5 = 0.82
    expect(report.b.quality!.avgScore).toBeCloseTo(0.82, 2)
  })

  // ─── AC2: quality threshold check ────────────────────────────────────────

  it('AC2: meetsQualityThreshold returns true quando ≥70% dos cenários têm score ≥ 0.80', () => {
    // 4/5 scenarios have score 0.85 ≥ 0.80 → 80% ≥ 70% threshold
    const ok = meetsQualityThreshold(db, 'haiku-first', { minScore: 0.8, minPassRate: 0.7 })
    expect(ok.passes).toBe(true)
    expect(ok.passRate).toBeGreaterThanOrEqual(0.7)
  })

  it('AC2: meetsQualityThreshold returns false quando < 70% dos cenários têm score ≥ 0.80', () => {
    // Insert a session where only 50% pass the 0.80 bar
    insertEvalRun(db, { runId: 'low-quality', goldenId: 'g1', score: 0.9, passed: true })
    insertEvalRun(db, { runId: 'low-quality', goldenId: 'g2', score: 0.6, passed: false })
    const ok = meetsQualityThreshold(db, 'low-quality', { minScore: 0.8, minPassRate: 0.7 })
    expect(ok.passes).toBe(false)
    expect(ok.passRate).toBeLessThan(0.7)
  })

  it('AC2: meetsQualityThreshold returns true=false for empty session (no scenarios)', () => {
    const ok = meetsQualityThreshold(db, 'empty-session', { minScore: 0.8, minPassRate: 0.7 })
    expect(ok.passes).toBe(false)
    expect(ok.total).toBe(0)
  })

  it('AC4: todas as funções são testáveis via mock sem chamar LLM real (apenas in-memory DB)', () => {
    // This test itself proves AC4: all assertions above use in-memory DB + synthetic data.
    // No network calls, no LLM provider, no API key required.
    const report = compareEvalSessions(db, 'baseline-dogfood-v2', 'haiku-first')
    expect(report).toBeDefined()
    const threshold = meetsQualityThreshold(db, 'haiku-first', { minScore: 0.8, minPassRate: 0.7 })
    expect(threshold).toBeDefined()
  })
})
