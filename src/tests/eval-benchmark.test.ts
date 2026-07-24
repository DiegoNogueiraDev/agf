/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Testes para o benchmark multi-modelo: scorecard com CI + effect size.
 */
import { describe, it, expect } from 'vitest'
import { buildScorecard, formatScorecard } from '../core/evals/scorecard.js'
import type { ScenarioResult } from '../core/evals/scorecard.js'

function mk(over: Partial<ScenarioResult> & { model: string }): ScenarioResult {
  return {
    id: 'x',
    tier: 'T0',
    model: over.model,
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
  }
}

describe('benchmark multi-modelo — scorecard com CI + effect size', () => {
  it('agrega por modelo com n≥3 para cada', () => {
    const results: ScenarioResult[] = [
      // Model A: 3 runs, 2 resolved
      mk({ model: 'maverick', resolved: true, tokensTotal: 100 }),
      mk({ model: 'maverick', resolved: true, tokensTotal: 150 }),
      mk({ model: 'maverick', resolved: false, tokensTotal: 200 }),
      // Model B: 3 runs, 1 resolved
      mk({ model: 'v4-flash', resolved: true, tokensTotal: 80 }),
      mk({ model: 'v4-flash', resolved: false, tokensTotal: 120 }),
      mk({ model: 'v4-flash', resolved: false, tokensTotal: 90 }),
    ]
    const sc = buildScorecard(results)
    expect(sc.byModel.length).toBe(2)
    expect(sc.comparisons.length).toBeGreaterThanOrEqual(1)

    const maverick = sc.byModel.find((m) => m.model === 'maverick')!
    expect(maverick.ci95Lower).not.toBeNull()
    expect(maverick.ci95Upper).not.toBeNull()
  })

  it('scorecard mostra comparações entre modelos com Cohen h', () => {
    const results: ScenarioResult[] = [
      mk({ model: 'maverick', resolved: true }),
      mk({ model: 'maverick', resolved: true }),
      mk({ model: 'maverick', resolved: true }),
      mk({ model: 'grok-4.3', resolved: false }),
      mk({ model: 'grok-4.3', resolved: false }),
      mk({ model: 'grok-4.3', resolved: false }),
    ]
    const sc = buildScorecard(results)
    expect(sc.comparisons.length).toBe(1)
    const cmp = sc.comparisons[0]
    expect(cmp.modelA).toBe('grok-4.3')
    expect(cmp.modelB).toBe('maverick')
    expect(cmp.cohensH).toBeLessThan(0) // grok < maverick
    expect(cmp.interpretation).toBeTruthy()
  })

  it('formatScorecard inclui Cohen no output multi-modelo', () => {
    const results: ScenarioResult[] = [
      mk({ model: 'm1', resolved: true }),
      mk({ model: 'm1', resolved: true }),
      mk({ model: 'm1', resolved: true }),
      mk({ model: 'm2', resolved: false }),
      mk({ model: 'm2', resolved: false }),
      mk({ model: 'm2', resolved: true }),
    ]
    const output = formatScorecard(buildScorecard(results)).join('\n')
    expect(output).toMatch(/Cohen/)
    expect(output).toMatch(/h/)
    expect(output).toMatch(/grande|médio|pequeno/)
  })
})
