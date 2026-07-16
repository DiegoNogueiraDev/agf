/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/plugins/browser/scenario-reinforcement.ts — reforço ACO cross-domínio.
 */

import { describe, it, expect } from 'vitest'
import { scenarioKey, reinforceScenario } from '../plugins/browser/scenario-reinforcement.js'
import type { ScenarioVerdict } from '../plugins/browser/scenario-oracle.js'

const passed: ScenarioVerdict = { verdict: 'passed', passedSteps: 3, totalSteps: 3 }
const failed: ScenarioVerdict = { verdict: 'failed', passedSteps: 1, totalSteps: 3, firstFailure: 1 }

describe('scenarioKey', () => {
  it('normaliza o domínio numa chave cross-domínio', () => {
    expect(scenarioKey('App.Example.COM')).toBe('scenario:domain:app.example.com')
  })
})

describe('reinforceScenario', () => {
  it('cenário passed → deposita na trilha do domínio (Δτ>0)', () => {
    const calls: Array<{ key: string; amount: number }> = []
    const amt = reinforceScenario((key, amount) => calls.push({ key, amount }), 'example.com', passed)
    expect(amt).toBeGreaterThan(0)
    expect(calls).toEqual([{ key: 'scenario:domain:example.com', amount: amt }])
  })

  it('cenário failed → não deposita e retorna 0 (evapora)', () => {
    const calls: unknown[] = []
    const amt = reinforceScenario((k, a) => calls.push([k, a]), 'example.com', failed)
    expect(amt).toBe(0)
    expect(calls).toHaveLength(0)
  })
})
