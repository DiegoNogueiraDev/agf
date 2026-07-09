/*!
 * TDD: backfill tokenBudget/expectedResolve into eval fixtures (node_6a89e55a3a9a).
 *
 * AC: Given each eval fixture scenario.json, When loadSuite runs,
 *     Then it carries tokenBudget and expectedResolve and loadSuite parses them.
 */

import { describe, it, expect } from 'vitest'
import { loadSuite } from '../core/evals/scenario-runner.js'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_DIR = join(__dirname, 'fixtures/eval')

describe('eval fixture tokenBudget/expectedResolve', () => {
  it('all fixtures carry tokenBudget', () => {
    const scenarios = loadSuite(FIXTURE_DIR)
    expect(scenarios.length).toBeGreaterThan(0)

    for (const s of scenarios) {
      expect(s.tokenBudget, `${s.id} missing tokenBudget`).toBeDefined()
      expect(typeof s.tokenBudget).toBe('number')
      expect(s.tokenBudget).toBeGreaterThan(0)
    }
  })

  it('all fixtures carry expectedResolve', () => {
    const scenarios = loadSuite(FIXTURE_DIR)
    for (const s of scenarios) {
      expect(s.expectedResolve, `${s.id} missing expectedResolve`).toBeDefined()
      expect(typeof s.expectedResolve).toBe('boolean')
    }
  })

  it('S-tier fixtures have tokenBudget <= 5000', () => {
    const scenarios = loadSuite(FIXTURE_DIR)
    const sTier = scenarios.filter((s) => s.tier === 'S')
    expect(sTier.length).toBeGreaterThan(0)
    for (const s of sTier) {
      expect(s.tokenBudget ?? 0, `${s.id} S-tier budget too high`).toBeLessThanOrEqual(5000)
    }
  })
})
