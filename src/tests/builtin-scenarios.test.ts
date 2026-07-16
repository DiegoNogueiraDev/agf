/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/observability/builtin-scenarios.ts — wires ScenarioRunner
 * (previously dormant, no-surface) into a self-check suite verifying the
 * status-flow-checker's core heuristic (createdAt === updatedAt ⇒ shortcut bypass)
 * against real :memory: SQLite, no mocks.
 */

import { describe, it, expect } from 'vitest'
import { ScenarioRunner } from '../core/observability/scenario-runner.js'
import { buildBuiltinScenarios } from '../core/observability/builtin-scenarios.js'

describe('buildBuiltinScenarios', () => {
  it('returns a non-empty array of scenarios', () => {
    const scenarios = buildBuiltinScenarios()
    expect(Array.isArray(scenarios)).toBe(true)
    expect(scenarios.length).toBeGreaterThan(0)
  })

  it('every scenario has a unique name', () => {
    const scenarios = buildBuiltinScenarios()
    const names = scenarios.map((s) => s.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('all built-in scenarios pass when run against real SQLite', () => {
    const runner = new ScenarioRunner()
    const results = runner.runAll(buildBuiltinScenarios())
    for (const result of results) {
      expect(result.failedAssertions, `${result.name} should have no failed assertions`).toEqual([])
      expect(result.passed).toBe(true)
    }
  })

  it('"done-task-requires-status-transition" detects a raw-SQL shortcut bypass', () => {
    const runner = new ScenarioRunner()
    const scenario = buildBuiltinScenarios().find((s) => s.name === 'done-task-requires-status-transition')
    expect(scenario).toBeDefined()
    const result = runner.run(scenario!)
    expect(result.passed).toBe(true)
    expect(result.stepsExecuted).toBeGreaterThan(0)
  })

  it('"proper-transition-updates-timestamp" confirms a normal flow leaves a footprint', () => {
    const runner = new ScenarioRunner()
    const scenario = buildBuiltinScenarios().find((s) => s.name === 'proper-transition-updates-timestamp')
    expect(scenario).toBeDefined()
    const result = runner.run(scenario!)
    expect(result.passed).toBe(true)
  })
})
