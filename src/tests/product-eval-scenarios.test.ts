/*!
 * Product-Relevant Evaluation Scenarios — structural validation tests.
 *
 * These tests verify that product-relevant eval scenarios exist and have
 * real oracles (not placeholder 'echo simulate:ok' testCmds).
 *
 * AC:
 *  1. p1-graph-crud scenario exists with required fields
 *  2. testCmd is a real command, not a simulation placeholder
 *  3. persona is 'product' (distinguishes from dev-task scenarios)
 *  4. tags include 'product-relevant'
 *  5. p2-delivery-pipeline scenario exists with pipeline-specific AC
 *  6. p3-harness-quality scenario exists (harness workflow)
 *  7. p4-next-context-cycle scenario exists (pull cycle workflow)
 *  8. p5-autopilot-simulate scenario exists (autonomous execution)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Scenario } from '../core/evals/scenario-runner.js'

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures/eval')

function loadScenario(id: string): Scenario {
  const scenarioPath = join(FIXTURES_DIR, id, 'scenario.json')
  expect(existsSync(scenarioPath), `scenario.json missing for ${id}`).toBe(true)
  const raw = readFileSync(scenarioPath, 'utf8')
  return JSON.parse(raw) as Scenario
}

// ── AC1-AC4: p1-graph-crud scenario ─────────────────────────────────────────

describe('p1-graph-crud: product-relevant graph CRUD eval scenario', () => {
  it('AC1: scenario.json exists with required fields', () => {
    const s = loadScenario('p1-graph-crud')
    expect(s.id).toBe('p1-graph-crud')
    expect(s.tier).toBeTruthy()
    expect(s.prd).toBeTruthy()
    expect(s.testCmd).toBeTruthy()
  })

  it('AC2: testCmd is a real oracle, not a simulation placeholder', () => {
    const s = loadScenario('p1-graph-crud')
    expect(s.testCmd).not.toBe("echo 'simulate:ok'")
    expect(s.testCmd).not.toContain('simulate:ok')
    expect(s.testCmd.length).toBeGreaterThan(20)
  })

  it('AC3: persona is "product" to distinguish from dev-task scenarios', () => {
    const s = loadScenario('p1-graph-crud')
    expect(s.persona).toBe('product')
  })

  it('AC4: tags include "product-relevant" marker', () => {
    const s = loadScenario('p1-graph-crud')
    expect(s.tags).toBeDefined()
    expect(s.tags).toContain('product-relevant')
  })
})

// ── AC5: p2-delivery-pipeline scenario ──────────────────────────────────────

describe('p2-delivery-pipeline: product-relevant delivery pipeline eval', () => {
  it('AC5: scenario.json exists with pipeline-specific structure', () => {
    const s = loadScenario('p2-delivery-pipeline')
    expect(s.id).toBe('p2-delivery-pipeline')
    expect(s.persona).toBe('product')
    expect(s.tags).toContain('product-relevant')
    expect(s.tags).toContain('delivery-pipeline')
    expect(s.testCmd).not.toContain('simulate:ok')
  })
})

// ── AC6: p3-harness-quality scenario ────────────────────────────────────────

describe('p3-harness-quality: product-relevant harness quality workflow', () => {
  it('AC6: scenario.json exists and tests harness assessment workflow', () => {
    const s = loadScenario('p3-harness-quality')
    expect(s.id).toBe('p3-harness-quality')
    expect(s.persona).toBe('product')
    expect(s.tags).toContain('product-relevant')
    expect(s.tags).toContain('harness')
    expect(s.testCmd).not.toContain('simulate:ok')
    expect(s.testCmd.length).toBeGreaterThan(20)
  })
})

// ── AC7: p4-next-context-cycle scenario ─────────────────────────────────────

describe('p4-next-context-cycle: product-relevant next+context pull cycle', () => {
  it('AC7: scenario.json exists and tests the pull task workflow', () => {
    const s = loadScenario('p4-next-context-cycle')
    expect(s.id).toBe('p4-next-context-cycle')
    expect(s.persona).toBe('product')
    expect(s.tags).toContain('product-relevant')
    expect(s.tags).toContain('next-task')
    expect(s.testCmd).not.toContain('simulate:ok')
    expect(s.testCmd.length).toBeGreaterThan(20)
  })
})

// ── AC8: p5-autopilot-simulate scenario ─────────────────────────────────────

describe('p5-autopilot-simulate: product-relevant autonomous execution', () => {
  it('AC8: scenario.json exists and tests autopilot simulate mode', () => {
    const s = loadScenario('p5-autopilot-simulate')
    expect(s.id).toBe('p5-autopilot-simulate')
    expect(s.persona).toBe('product')
    expect(s.tags).toContain('product-relevant')
    expect(s.tags).toContain('autopilot')
    expect(s.testCmd).not.toContain('simulate:ok')
    expect(s.testCmd.length).toBeGreaterThan(20)
  })
})
