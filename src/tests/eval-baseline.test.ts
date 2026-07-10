/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Task 1.2 — agf eval Baseline com Modelos Reais
 *
 * AC:
 * 1. --models + --suite dogfood → scorecard com quality + cost por modelo
 * 2. baseline persiste em llm_call_ledger com session_id="baseline-dogfood-v2"
 * 3. ModelAgg tem: model, avg_tokens_in, avg_tokens_out, avg_cost_usd, quality_score, latency_ms
 * 4. fixtures em src/tests/fixtures/eval/ (5×S, 3×M, 2×L = 10 total)
 * 5. --simulate → mock adapter, sem API real
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildScorecard, type ScenarioResult } from '../core/evals/scorecard.js'

const FIXTURES_DIR = join(process.cwd(), 'src/tests/fixtures/eval')

function readFixtureScenario(name: string): unknown {
  const path = join(FIXTURES_DIR, name, 'scenario.json')
  return JSON.parse(readFileSync(path, 'utf-8'))
}

describe('Eval fixtures (AC#4)', () => {
  it('fixtures directory exists', () => {
    expect(existsSync(FIXTURES_DIR)).toBe(true)
  })

  it('has at least 10 scenario subdirectories', () => {
    const entries = readdirSync(FIXTURES_DIR, { withFileTypes: true }).filter((e) => e.isDirectory())
    expect(entries.length).toBeGreaterThanOrEqual(10)
  })

  it('has at least 5 S-tier scenarios', () => {
    const scenarios = readdirSync(FIXTURES_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => readFixtureScenario(e.name) as { tier: string })
    const sTier = scenarios.filter((s) => s.tier === 'S')
    expect(sTier.length).toBeGreaterThanOrEqual(5)
  })

  it('has at least 3 M-tier scenarios', () => {
    const scenarios = readdirSync(FIXTURES_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => readFixtureScenario(e.name) as { tier: string })
    const mTier = scenarios.filter((s) => s.tier === 'M')
    expect(mTier.length).toBeGreaterThanOrEqual(3)
  })

  it('has 2 L-tier scenarios', () => {
    const scenarios = readdirSync(FIXTURES_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => readFixtureScenario(e.name) as { tier: string })
    const lTier = scenarios.filter((s) => s.tier === 'L')
    expect(lTier).toHaveLength(2)
  })

  it('each scenario.json has required fields', () => {
    const dirs = readdirSync(FIXTURES_DIR, { withFileTypes: true }).filter((e) => e.isDirectory())
    for (const dir of dirs) {
      const s = readFixtureScenario(dir.name) as { id?: string; tier?: string; prd?: string; testCmd?: string }
      expect(s.id, `${dir.name}: missing id`).toBeTruthy()
      expect(s.tier, `${dir.name}: missing tier`).toBeTruthy()
      expect(s.prd, `${dir.name}: missing prd`).toBeTruthy()
      expect(s.testCmd, `${dir.name}: missing testCmd`).toBeTruthy()
    }
  })
})

describe('ModelAgg comparison fields (AC#3)', () => {
  const makeResult = (
    model: string,
    resolved: boolean,
    tokIn: number,
    tokOut: number,
    durationMs: number,
  ): ScenarioResult => ({
    id: 'test',
    tier: 'S',
    model,
    resolved,
    testsPassed: resolved,
    done: resolved,
    tokensIn: tokIn,
    tokensOut: tokOut,
    tokensTotal: tokIn + tokOut,
    costUsd: (tokIn * 1 + tokOut * 2) / 1_000_000,
    attempts: 3,
    durationMs,
    stopped: resolved ? 'done' : 'max_steps',
    qualityScore: resolved ? 1.0 : 0.0,
  })

  it('ModelAgg has avgTokensIn field (AC#3)', () => {
    const results = [
      makeResult('claude-haiku-4-5', true, 1000, 500, 2000),
      makeResult('claude-haiku-4-5', false, 800, 400, 1500),
    ]
    const sc = buildScorecard(results)
    expect(sc.byModel[0]).toHaveProperty('avgTokensIn')
    expect(sc.byModel[0].avgTokensIn).toBe(900) // (1000+800)/2
  })

  it('ModelAgg has avgTokensOut field (AC#3)', () => {
    const results = [
      makeResult('claude-sonnet-4-6', true, 2000, 1000, 3000),
      makeResult('claude-sonnet-4-6', true, 1600, 800, 2500),
    ]
    const sc = buildScorecard(results)
    expect(sc.byModel[0]).toHaveProperty('avgTokensOut')
    expect(sc.byModel[0].avgTokensOut).toBe(900) // (1000+800)/2
  })

  it('ModelAgg has avgQualityScore field (AC#3)', () => {
    const results = [
      makeResult('claude-haiku-4-5', true, 500, 200, 1000),
      makeResult('claude-haiku-4-5', false, 500, 200, 1000),
    ]
    const sc = buildScorecard(results)
    expect(sc.byModel[0]).toHaveProperty('avgQualityScore')
    expect(sc.byModel[0].avgQualityScore).toBeCloseTo(0.5, 5)
  })

  it('ModelAgg has avgLatencyMs field (AC#3)', () => {
    const results = [
      makeResult('claude-haiku-4-5', true, 500, 200, 1000),
      makeResult('claude-haiku-4-5', true, 500, 200, 3000),
    ]
    const sc = buildScorecard(results)
    expect(sc.byModel[0]).toHaveProperty('avgLatencyMs')
    expect(sc.byModel[0].avgLatencyMs).toBe(2000) // (1000+3000)/2
  })
})

describe('ScenarioResult qualityScore field (AC#1)', () => {
  it('ScenarioResult type accepts qualityScore field', () => {
    const r: ScenarioResult = {
      id: 'test',
      tier: 'S',
      model: 'claude-haiku-4-5',
      resolved: true,
      testsPassed: true,
      done: true,
      tokensIn: 1000,
      tokensOut: 500,
      tokensTotal: 1500,
      costUsd: 0.002,
      attempts: 3,
      durationMs: 2000,
      stopped: 'done',
      qualityScore: 1.0,
    }
    expect(r.qualityScore).toBe(1.0)
  })
})
