/*!
 * Task node_6da365954faf — fixture loader + deterministic stub-LLM token counter.
 *
 * AC: Given the stub, when a scenario runs twice, identical token totals are produced.
 */

import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { loadSuite, runScenario } from '../core/evals/scenario-runner.js'
import { makeStubOrchestrate } from '../core/evals/stub-orchestrate.js'

const ECONOMY_SUITE = join(import.meta.dirname, 'fixtures/eval/economy')

describe('economy fixture loader', () => {
  it('loads economy suite fixtures', () => {
    const scenarios = loadSuite(ECONOMY_SUITE)
    expect(scenarios.length).toBeGreaterThanOrEqual(1)
  })
})

describe('makeStubOrchestrate — deterministic token counter', () => {
  it('produces identical token totals on two successive runs (AC)', async () => {
    const scenarios = loadSuite(ECONOMY_SUITE)
    const scenario = scenarios[0]

    const run = async (): Promise<number> => {
      const result = await runScenario(
        scenario,
        { live: false },
        { orchestrate: makeStubOrchestrate({ inputTokens: 100, outputTokens: 50 }) },
      )
      return result.tokensTotal
    }

    const [t1, t2] = await Promise.all([run(), run()])
    expect(t1).toBe(t2)
    expect(t1).toBeGreaterThan(0)
  })
})
