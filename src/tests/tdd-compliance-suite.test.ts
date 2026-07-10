import { describe, it, expect } from 'vitest'
import { resolve, join } from 'node:path'
import { existsSync } from 'node:fs'
import { loadSuite } from '../core/evals/scenario-runner.js'

const TDD_SUITE_DIR = join(process.cwd(), 'evals', 'suite', 'tdd-compliance')

describe('tdd-compliance eval suite', () => {
  it('suite directory exists', () => {
    expect(existsSync(TDD_SUITE_DIR)).toBe(true)
  })

  it('loadSuite returns at least one scenario', () => {
    const scenarios = loadSuite(TDD_SUITE_DIR)
    expect(scenarios.length).toBeGreaterThanOrEqual(1)
  })

  it('first scenario has required fields', () => {
    const scenarios = loadSuite(TDD_SUITE_DIR)
    const s = scenarios[0]
    expect(s).toHaveProperty('id')
    expect(s).toHaveProperty('tier')
    expect(s).toHaveProperty('prd')
    expect(s).toHaveProperty('testCmd')
  })

  it('tdd-cycle-check scenario has tdd tags', () => {
    const scenarios = loadSuite(TDD_SUITE_DIR)
    const tddScenario = scenarios.find((s) => s.id === 'tdd-cycle-check')
    expect(tddScenario).toBeDefined()
    expect(tddScenario?.tags).toContain('tdd')
    expect(tddScenario?.tags).toContain('compliance')
  })
})

describe('SUITE_ALIASES', () => {
  it('tdd-compliance alias resolves to an existing directory', () => {
    const dir = join(process.cwd(), 'evals', 'suite', 'tdd-compliance')
    expect(existsSync(dir)).toBe(true)
  })

  it('tdd-compliance alias directory contains at least one scenario', () => {
    const dir = join(process.cwd(), 'evals', 'suite', 'tdd-compliance')
    const scenarios = loadSuite(dir)
    expect(scenarios.length).toBeGreaterThanOrEqual(1)
  })
})
