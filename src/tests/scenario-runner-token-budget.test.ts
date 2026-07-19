/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_eb0a81941c93 — tokenBudget enforcement in runScenario
 *
 * AC1: Given tokenBudget=5000 and orchestrate records >5000 tokens →
 *      result.stopped === 'budget_exhausted', result.resolved === false
 * AC2: Given no tokenBudget → byte-identical behavior (no budget_exhausted)
 */

import { describe, it, expect } from 'vitest'
import { runScenario } from '../core/evals/scenario-runner.js'
import type { Scenario, RunScenarioDeps, Orchestrate } from '../core/evals/scenario-runner.js'
import type { DeliveryReport } from '../core/orchestrator/run-delivery.js'

// Minimal scenario fixture
function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'test-budget',
    tier: 'T0',
    prd: '# Budget test\nTask: do nothing.',
    testCmd: 'true', // exit 0 — always passes
    ...overrides,
  }
}

// Orchestrate stub that records N tokens to the injected ledger then returns 'done'
function makeOrchestrate(tokensToRecord: number): Orchestrate {
  return async (_store, { ledger }) => {
    ledger.record('task-1', { model: 'test', tokensIn: tokensToRecord, tokensOut: 0 })
    const report: DeliveryReport = {
      stopped: 'done',
      steps: 1,
      nodeId: 'task-1',
      summary: '',
    }
    return report
  }
}

// Deps factory: real test runner replaced by stub that always passes
function makeDeps(orchestrate: Orchestrate): RunScenarioDeps {
  return {
    orchestrate,
    runTest: (_dir, _cmd) => ({ passed: true, output: '' }),
    now: (() => {
      let t = 0
      return () => t++
    })(),
  }
}

describe('runScenario tokenBudget enforcement (AC1)', () => {
  it('sets stopped=budget_exhausted when tokens exceed budget', async () => {
    const scenario = makeScenario({ tokenBudget: 5000 })
    const deps = makeDeps(makeOrchestrate(6000))
    const result = await runScenario(scenario, { live: false }, deps)
    expect(result.stopped).toBe('budget_exhausted')
  })

  it('resolved is false when budget exhausted', async () => {
    const scenario = makeScenario({ tokenBudget: 5000 })
    const deps = makeDeps(makeOrchestrate(6000))
    const result = await runScenario(scenario, { live: false }, deps)
    expect(result.resolved).toBe(false)
  })

  it('does NOT set budget_exhausted when tokens are within budget', async () => {
    const scenario = makeScenario({ tokenBudget: 5000 })
    const deps = makeDeps(makeOrchestrate(4000))
    const result = await runScenario(scenario, { live: false }, deps)
    expect(result.stopped).not.toBe('budget_exhausted')
  })
})

describe('runScenario tokenBudget enforcement (AC2)', () => {
  it('behaves identically when no tokenBudget set (stopped=done when resolved)', async () => {
    const scenario = makeScenario() // no tokenBudget
    const deps = makeDeps(makeOrchestrate(10000)) // huge tokens, but no budget
    const result = await runScenario(scenario, { live: false }, deps)
    // Without tokenBudget, orchestrate returned 'done' so stopped should be 'done'
    expect(result.stopped).toBe('done')
  })

  it('resolved is true when no tokenBudget and orchestrate returns done', async () => {
    const scenario = makeScenario()
    const deps = makeDeps(makeOrchestrate(10000))
    const result = await runScenario(scenario, { live: false }, deps)
    expect(result.resolved).toBe(true)
  })
})
