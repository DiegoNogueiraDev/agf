/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/plugins/browser/nl-scenario-compiler.ts — compileScenario.
 */

import { describe, it, expect } from 'vitest'
import { compileScenario } from '../plugins/browser/nl-scenario-compiler.js'

describe('compileScenario', () => {
  it('AC1: roteiro de 3+ passos → plano ordenado, cada passo num tool válido', () => {
    const nl = [
      '1. navigate to https://example.com/login',
      "2. type 'user@example.com' in the email field",
      '3. click the login button',
    ].join('\n')

    const plan = compileScenario(nl)

    expect(plan.steps).toHaveLength(3)
    expect(plan.steps.map((s) => s.tool)).toEqual(['browser_navigate', 'browser_type', 'browser_click'])
    expect(plan.unresolved).toBe(0)
    expect(plan.steps[0].args.url).toContain('example.com/login')
    expect(plan.steps[1].args).toMatchObject({ text: 'user@example.com', field: 'the email field' })
    expect(plan.steps[2].args.target).toBe('the login button')
    expect(plan.steps.every((s) => !s.needsDelegation)).toBe(true)
  })

  it('aceita português e bullets', () => {
    const plan = compileScenario('- acesse https://app.test\n- clique no botão Entrar')
    expect(plan.steps.map((s) => s.tool)).toEqual(['browser_navigate', 'browser_click'])
    expect(plan.steps[0].args.url).toContain('app.test')
    expect(plan.steps[1].args.target).toBe('botão Entrar')
  })

  it('AC2: passo ambíguo → needsDelegation (tool null) e conta em unresolved', () => {
    const plan = compileScenario('navigate to https://x.com\nfaça a mágica acontecer de algum jeito')
    expect(plan.steps[0].needsDelegation).toBe(false)
    expect(plan.steps[1].needsDelegation).toBe(true)
    expect(plan.steps[1].tool).toBeNull()
    expect(plan.unresolved).toBe(1)
  })

  it('mapeia screenshot e press key', () => {
    const plan = compileScenario('take a screenshot\npress Enter')
    expect(plan.steps[0].tool).toBe('browser_screenshot')
    expect(plan.steps[1].tool).toBe('browser_press_key')
    expect(plan.steps[1].args.key).toBe('Enter')
  })

  it('entrada vazia → plano vazio', () => {
    const plan = compileScenario('   \n\n  ')
    expect(plan.steps).toEqual([])
    expect(plan.unresolved).toBe(0)
  })
})
