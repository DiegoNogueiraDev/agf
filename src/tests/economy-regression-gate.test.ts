/*!
 * Task node_1d9a982a3983 — baseline snapshot + economy regression gate.
 *
 * AC1: Given committed baseline, When cost-per-success exceeds baseline × (1+tolerance),
 *      Then result code is ECONOMY_REGRESSION.
 * AC2: Given cost within tolerance, When gate runs, Then passes with delta% per model.
 * AC3: Given no baseline file, When gate runs, Then writes baseline and code is BASELINE_CREATED.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  checkEconomyRegressionGate,
  costPerSuccessMap,
  type EconomyGateResult,
  type EconomyBaseline,
} from '../core/evals/economy-regression-gate.js'

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'agf-ecoreg-'))
}

describe('checkEconomyRegressionGate', () => {
  let dir: string
  beforeEach(() => {
    dir = makeTmpDir()
  })
  afterEach(() => rmSync(dir, { recursive: true }))

  it('creates baseline when no file exists (AC3)', () => {
    const result: EconomyGateResult = checkEconomyRegressionGate(dir, { cheap: 0.002, build: 0.01 }, 0.1)
    expect(result.code).toBe('BASELINE_CREATED')
    expect(result.passed).toBe(true)
    expect(existsSync(join(dir, 'economy-baseline.json'))).toBe(true)
  })

  it('passes when cost within tolerance (AC2)', () => {
    // Write baseline first
    checkEconomyRegressionGate(dir, { cheap: 0.002, build: 0.01 }, 0.1)
    // Same cost — should pass
    const result = checkEconomyRegressionGate(dir, { cheap: 0.002, build: 0.01 }, 0.1)
    expect(result.code).toBe('OK')
    expect(result.passed).toBe(true)
    expect(result.deltaByModel).toBeDefined()
  })

  it('fails with ECONOMY_REGRESSION when cost exceeds tolerance (AC1)', () => {
    checkEconomyRegressionGate(dir, { cheap: 0.002, build: 0.01 }, 0.1)
    // 50% higher → regression
    const result = checkEconomyRegressionGate(dir, { cheap: 0.003, build: 0.015 }, 0.1)
    expect(result.code).toBe('ECONOMY_REGRESSION')
    expect(result.passed).toBe(false)
    expect(result.regressions).toBeDefined()
    expect((result.regressions ?? []).length).toBeGreaterThan(0)
  })

  it('baseline file is valid JSON with model keys', () => {
    checkEconomyRegressionGate(dir, { cheap: 0.002, build: 0.01 }, 0.1)
    const raw = readFileSync(join(dir, 'economy-baseline.json'), 'utf-8')
    const baseline: EconomyBaseline = JSON.parse(raw)
    expect(baseline.costPerSuccess).toBeDefined()
    expect(typeof baseline.costPerSuccess.cheap).toBe('number')
  })
})

describe('costPerSuccessMap', () => {
  it('builds a model→costPerSuccess map from scorecard rows', () => {
    const map = costPerSuccessMap([
      { model: 'cheap', costPerSuccess: 0.002 },
      { model: 'build', costPerSuccess: 0.01 },
    ])
    expect(map).toEqual({ cheap: 0.002, build: 0.01 })
  })

  it('drops rows with a null costPerSuccess (no successful runs)', () => {
    const map = costPerSuccessMap([
      { model: 'cheap', costPerSuccess: 0.002 },
      { model: 'frontier', costPerSuccess: null },
    ])
    expect(map).toEqual({ cheap: 0.002 })
  })

  it('returns an empty map for an empty scorecard', () => {
    expect(costPerSuccessMap([])).toEqual({})
  })
})
