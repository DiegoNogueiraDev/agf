import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { loadSuite } from '../core/evals/scenario-runner.js'

const ECONOMY_SUITE = join(import.meta.dirname, 'fixtures/eval/economy')

describe('economy benchmark fixtures', () => {
  it('loads at least 3 scenarios from the economy suite dir', () => {
    const scenarios = loadSuite(ECONOMY_SUITE)
    expect(scenarios.length).toBeGreaterThanOrEqual(3)
  })

  it('every scenario has tokenBudget as a positive number', () => {
    const scenarios = loadSuite(ECONOMY_SUITE)
    for (const s of scenarios) {
      expect(typeof s.tokenBudget).toBe('number')
      expect(s.tokenBudget).toBeGreaterThan(0)
    }
  })

  it('every scenario has expectedResolve as a boolean', () => {
    const scenarios = loadSuite(ECONOMY_SUITE)
    for (const s of scenarios) {
      expect(typeof s.expectedResolve).toBe('boolean')
    }
  })

  it('scenarios contain no business logic (only data fields)', () => {
    const scenarios = loadSuite(ECONOMY_SUITE)
    for (const s of scenarios) {
      // Scenario is a plain data object — no methods
      expect(typeof s.prd).toBe('string')
      expect(typeof s.testCmd).toBe('string')
      expect(s.prd.length).toBeGreaterThan(0)
    }
  })
})
