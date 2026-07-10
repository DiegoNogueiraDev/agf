/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/plugins/browser/scenario-oracle.ts — evaluateScenario + buildScenarioEvents.
 */

import { describe, it, expect } from 'vitest'
import { evaluateScenario, buildScenarioEvents } from '../plugins/browser/scenario-oracle.js'

describe('evaluateScenario', () => {
  it('todos os passos ok → passed', () => {
    const v = evaluateScenario([
      { tool: 'browser_navigate', ok: true },
      { tool: 'browser_click', ok: true },
    ])
    expect(v.verdict).toBe('passed')
    expect(v.passedSteps).toBe(2)
    expect(v.firstFailure).toBeUndefined()
  })

  it('um passo falha → failed + firstFailure', () => {
    const v = evaluateScenario([
      { tool: 'browser_navigate', ok: true },
      { tool: 'browser_click', ok: false },
      { tool: 'browser_type', ok: true },
    ])
    expect(v.verdict).toBe('failed')
    expect(v.passedSteps).toBe(2)
    expect(v.firstFailure).toBe(1)
  })

  it('cenário vazio → failed (nada confirmado)', () => {
    expect(evaluateScenario([]).verdict).toBe('failed')
  })
})

describe('buildScenarioEvents', () => {
  it('AC1: started → step(+evidence) → passed/failed, ordenado', () => {
    const ev = buildScenarioEvents('sc1', [
      { tool: 'browser_navigate', ok: true, evidence: 'shot1.png' },
      { tool: 'browser_click', ok: true },
    ])
    expect(ev[0].kind).toBe('started')
    expect(ev[ev.length - 1].kind).toBe('passed')
    expect(ev.map((e) => e.kind)).toEqual(['started', 'step', 'evidence', 'step', 'passed'])
    expect(ev.every((e) => e.scenarioId === 'sc1')).toBe(true)
  })

  it('cenário com falha termina em failed', () => {
    const ev = buildScenarioEvents('sc2', [{ tool: 'browser_click', ok: false }])
    expect(ev[ev.length - 1].kind).toBe('failed')
  })
})
