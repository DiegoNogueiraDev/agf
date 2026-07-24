/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */
import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { testsGreen } from '../core/evals/scorers.js'
import { buildScorecard, formatScorecard, type ScenarioResult } from '../core/evals/scorecard.js'
import { runScenario, type Orchestrate, type Scenario } from '../core/evals/scenario-runner.js'

describe('scorers.testsGreen', () => {
  it('usa o runner injetado (verde/vermelho)', () => {
    expect(testsGreen('/x', 'npm test', () => ({ passed: true, output: 'ok' })).passed).toBe(true)
    expect(testsGreen('/x', 'npm test', () => ({ passed: false, output: 'fail' })).passed).toBe(false)
  })
})

describe('buildScorecard', () => {
  const mk = (over: Partial<ScenarioResult>): ScenarioResult => ({
    id: 'x',
    tier: 'T0',
    model: 'm',
    resolved: false,
    testsPassed: false,
    done: false,
    tokensIn: 0,
    tokensOut: 0,
    tokensTotal: 0,
    costUsd: 0,
    attempts: 0,
    durationMs: 0,
    stopped: 'done',
    ...over,
  })
  it('agrega resolve% e custo-por-sucesso por tier', () => {
    const sc = buildScorecard([
      mk({ id: 'a', tier: 'T0', resolved: true, tokensTotal: 100, costUsd: 0.001, durationMs: 10 }),
      mk({ id: 'b', tier: 'T0', resolved: false, tokensTotal: 200, costUsd: 0.002, durationMs: 20 }),
      mk({ id: 'c', tier: 'T1', resolved: true, tokensTotal: 300, costUsd: 0.003, durationMs: 30 }),
    ])
    expect(sc.total).toBe(3)
    expect(sc.resolved).toBe(2)
    expect(sc.resolveRate).toBeCloseTo(2 / 3, 5)
    expect(sc.costPerResolvedUsd).toBeCloseTo(0.006 / 2, 6)
    const t0 = sc.byTier.find((t) => t.tier === 'T0')!
    expect(t0.resolveRate).toBeCloseTo(0.5, 5)
    expect(t0.costPerResolvedUsd).toBeCloseTo(0.003 / 1, 6) // T0 custo total 0.003, 1 resolvido
    expect(formatScorecard(sc).join('\n')).toMatch(/Scorecard/i)
  })

  it('CI é null para n<3 (amostra insuficiente)', () => {
    const sc = buildScorecard([
      mk({ id: 'a', tier: 'T0', resolved: true }),
      mk({ id: 'b', tier: 'T0', resolved: false }),
    ])
    const t0 = sc.byTier.find((t) => t.tier === 'T0')!
    expect(t0.ci95Lower).toBeNull()
    expect(t0.ci95Upper).toBeNull()
  })

  it('computa intervalo de confiança para n≥3 (tier)', () => {
    const sc = buildScorecard([
      mk({ id: 'a', tier: 'T0', resolved: true }),
      mk({ id: 'b', tier: 'T0', resolved: true }),
      mk({ id: 'c', tier: 'T0', resolved: false }),
      mk({ id: 'd', tier: 'T0', resolved: true }),
      mk({ id: 'e', tier: 'T0', resolved: false }),
    ])
    const t0 = sc.byTier.find((t) => t.tier === 'T0')!
    expect(t0.ci95Lower).not.toBeNull()
    expect(t0.ci95Upper).not.toBeNull()
    expect(t0.ci95Lower).toBeLessThan(t0.resolveRate)
    expect(t0.ci95Upper).toBeGreaterThan(t0.resolveRate)
  })

  it('computa CI por modelo quando n≥3', () => {
    const sc = buildScorecard([
      mk({ id: 'a', model: 'm1', resolved: true }),
      mk({ id: 'b', model: 'm1', resolved: true }),
      mk({ id: 'c', model: 'm1', resolved: false }),
      mk({ id: 'd', model: 'm2', resolved: false }),
      mk({ id: 'e', model: 'm2', resolved: false }),
      mk({ id: 'f', model: 'm2', resolved: true }),
      mk({ id: 'g', model: 'm2', resolved: false }),
    ])
    const m1 = sc.byModel.find((m) => m.model === 'm1')!
    const m2 = sc.byModel.find((m) => m.model === 'm2')!
    expect(m1.ci95Lower).not.toBeNull()
    expect(m2.ci95Lower).not.toBeNull()
  })

  it('computa Cohen h entre modelos com n≥3', () => {
    const sc = buildScorecard([
      mk({ id: 'a', model: 'm1', resolved: true }),
      mk({ id: 'b', model: 'm1', resolved: true }),
      mk({ id: 'c', model: 'm1', resolved: true }),
      mk({ id: 'd', model: 'm2', resolved: false }),
      mk({ id: 'e', model: 'm2', resolved: false }),
      mk({ id: 'f', model: 'm2', resolved: true }),
    ])
    expect(sc.comparisons.length).toBe(1)
    const cmp = sc.comparisons[0]
    expect(cmp.modelA).toBe('m1')
    expect(cmp.modelB).toBe('m2')
    expect(cmp.cohensH).toBeGreaterThan(0) // m1 > m2
    expect(cmp.interpretation).toBeTruthy()
  })

  it('não computa comparações quando n<3 para todos modelos', () => {
    const sc = buildScorecard([
      mk({ id: 'a', model: 'm1', resolved: true }),
      mk({ id: 'b', model: 'm2', resolved: false }),
    ])
    expect(sc.comparisons.length).toBe(0)
  })

  it('formatScorecard inclui CI e effect size no output', () => {
    const sc = buildScorecard([
      mk({ id: 'a', model: 'm1', resolved: true }),
      mk({ id: 'b', model: 'm1', resolved: true }),
      mk({ id: 'c', model: 'm1', resolved: false }),
      mk({ id: 'd', model: 'm1', resolved: true }),
      mk({ id: 'e', model: 'm2', resolved: false }),
      mk({ id: 'f', model: 'm2', resolved: false }),
      mk({ id: 'g', model: 'm2', resolved: false }),
    ])
    const output = formatScorecard(sc).join('\n')
    expect(output).toMatch(/CI95%/)
    expect(output).toMatch(/Cohen/)
  })
})

describe('runScenario (orchestrate fake, 0 token)', () => {
  const scenario: Scenario = {
    id: 't0-mul',
    tier: 'T0',
    persona: 'dev',
    prd: '# Task\n## implementar mul(a,b)\nRetorna a*b.\n### Acceptance Criteria\n- mul(2,3) = 6',
    testCmd: 'echo ok',
    seed: { 'src/math.js': 'exports.add=(a,b)=>a+b\n' },
  }

  it('resolved = tests verde E done; mede tokens/custo', async () => {
    const orchestrate: Orchestrate = async (_store, opts) => {
      writeFileSync(join(opts.dir, 'src/mul.js'), 'exports.mul=(a,b)=>a*b\n')
      opts.ledger.recordCall('n1', {
        model: 'deepseek/deepseek-chat',
        prompt: 'p',
        response: 'r',
        reportedIn: 100,
        reportedOut: 50,
      })
      return { steps: 1, stopped: 'done', actions: ['implement'] }
    }
    const res = await runScenario(
      scenario,
      { live: false, model: 'deepseek/deepseek-chat' },
      {
        orchestrate,
        runTest: () => ({ passed: true, output: 'ok' }),
      },
    )
    expect(res.resolved).toBe(true)
    expect(res.done).toBe(true)
    expect(res.testsPassed).toBe(true)
    expect(res.tokensTotal).toBe(150)
    expect(res.costUsd).toBeGreaterThan(0)
  })

  it('tests vermelho → não resolvido (mesmo com done)', async () => {
    const res = await runScenario(
      scenario,
      { live: false, model: 'deepseek/deepseek-chat' },
      {
        orchestrate: async () => ({ steps: 1, stopped: 'done', actions: [] }),
        runTest: () => ({ passed: false, output: 'red' }),
      },
    )
    expect(res.resolved).toBe(false)
    expect(res.testsPassed).toBe(false)
    expect(res.done).toBe(true)
  })

  it('escalou → não resolvido', async () => {
    const res = await runScenario(
      scenario,
      { live: false },
      {
        orchestrate: async () => {
          throw new Error('autopilot escalou')
        },
        runTest: () => ({ passed: true, output: 'ok' }),
      },
    )
    expect(res.resolved).toBe(false)
    expect(res.stopped).toBe('escalation')
    expect(res.done).toBe(false)
  })
})
