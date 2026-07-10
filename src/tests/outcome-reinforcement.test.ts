/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/core/colony/outcome-reinforcement.ts — ACO feedback loop.
 */

import { describe, it, expect } from 'vitest'
import { computeReinforcementAmount, reinforceFromOutcome } from '../core/colony/outcome-reinforcement.js'

describe('computeReinforcementAmount', () => {
  it('sucesso simples → depósito base 1.0', () => {
    expect(computeReinforcementAmount({ success: true })).toBe(1.0)
  })

  it('sucesso + harnessDelta positivo → bônus proporcional (cap +1.0)', () => {
    expect(computeReinforcementAmount({ success: true, harnessDelta: 5 })).toBe(1.5)
    expect(computeReinforcementAmount({ success: true, harnessDelta: 50 })).toBe(2.0) // cap
  })

  it('sucesso + grade A/B → bônus de grade', () => {
    expect(computeReinforcementAmount({ success: true, dodGrade: 'A' })).toBe(1.5)
    expect(computeReinforcementAmount({ success: true, dodGrade: 'B' })).toBe(1.2)
    expect(computeReinforcementAmount({ success: true, dodGrade: 'C' })).toBe(1.0)
  })

  it('falha → 0 (sem reforço negativo; deixa evaporar)', () => {
    expect(computeReinforcementAmount({ success: false, harnessDelta: 9, dodGrade: 'A' })).toBe(0)
  })
})

describe('reinforceFromOutcome', () => {
  it('sucesso → deposita Δτ na key e retorna o valor', () => {
    const calls: Array<{ key: string; amount: number }> = []
    const amt = reinforceFromOutcome((key, amount) => calls.push({ key, amount }), 'pattern:rpa', {
      success: true,
      dodGrade: 'A',
    })
    expect(amt).toBe(1.5)
    expect(calls).toEqual([{ key: 'pattern:rpa', amount: 1.5 }])
  })

  it('falha → NÃO deposita e retorna 0', () => {
    const calls: unknown[] = []
    const amt = reinforceFromOutcome((k, a) => calls.push([k, a]), 'pattern:rpa', { success: false })
    expect(amt).toBe(0)
    expect(calls).toHaveLength(0)
  })
})
