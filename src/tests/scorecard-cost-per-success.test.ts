/*!
 * TDD: scorecard output renders costPerSuccess in data.rows (node_332f0e625226).
 *
 * AC: Given --json, when rendered, then data.rows[].costPerSuccess is present.
 */

import { describe, it, expect } from 'vitest'
import { buildScorecard } from '../core/evals/scorecard.js'
import type { ScenarioResult } from '../core/evals/scorecard.js'

function makeResult(model: string, resolved: boolean, costUsd: number): ScenarioResult {
  return {
    scenarioId: 's1',
    model,
    resolved,
    costUsd,
    tokensTotal: 100,
    tokensIn: 80,
    tokensOut: 20,
    durationMs: 500,
    qualityScore: null,
    error: null,
  }
}

describe('scorecard rows include costPerSuccess', () => {
  it('byModel entries have costPerSuccess field', () => {
    const results = [makeResult('gpt-4', true, 0.05), makeResult('gpt-4', true, 0.03)]
    const sc = buildScorecard(results)
    const row = sc.byModel[0]!
    expect(row).toHaveProperty('costPerSuccess')
  })

  it('costPerSuccess = totalCostUsd / resolved when resolved > 0', () => {
    const results = [makeResult('model-x', true, 0.06), makeResult('model-x', true, 0.04)]
    const sc = buildScorecard(results)
    const row = sc.byModel.find((m) => m.model === 'model-x')!
    expect(row.costPerSuccess).toBeCloseTo(0.1 / 2, 6)
  })

  it('costPerSuccess = null when no resolved tasks', () => {
    const results = [makeResult('model-y', false, 0.02)]
    const sc = buildScorecard(results)
    const row = sc.byModel.find((m) => m.model === 'model-y')!
    expect(row.costPerSuccess).toBeNull()
  })
})
