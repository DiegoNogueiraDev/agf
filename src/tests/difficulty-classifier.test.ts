/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/plugins/browser/difficulty-classifier.ts — classifyDifficulty.
 * Integra com o compilador NL (Task 2.1).
 */

import { describe, it, expect } from 'vitest'
import { classifyDifficulty } from '../plugins/browser/difficulty-classifier.js'
import { compileScenario } from '../plugins/browser/nl-scenario-compiler.js'

describe('classifyDifficulty', () => {
  it('AC1: cenário 100% resolvido → deterministic (alta confiança, 0 token)', () => {
    const plan = compileScenario('navigate to https://x.com\ntype "a" in field\nclick the button')
    const d = classifyDifficulty(plan)
    expect(d.resolvedRatio).toBe(1)
    expect(d.confidence).toBe(0.9)
    expect(d.route).toBe('deterministic')
  })

  it('poucos passos abertos → ai_assisted', () => {
    // 4 resolvidos + 1 aberto → conf média 0.72 (≥0.7)
    const plan = compileScenario(
      ['navigate to https://x.com', 'click a', 'click b', 'click c', 'faça algo ambíguo'].join('\n'),
    )
    const d = classifyDifficulty(plan)
    expect(d.totalSteps).toBe(5)
    expect(d.route).toBe('ai_assisted')
  })

  it('AC2: cenário sem padrão (todos abertos) → escalate', () => {
    const plan = compileScenario('faça a mágica\nresolva o captcha sozinho')
    const d = classifyDifficulty(plan)
    expect(d.confidence).toBe(0)
    expect(d.route).toBe('escalate')
  })

  it('plano vazio → escalate', () => {
    expect(classifyDifficulty({ steps: [] })).toMatchObject({ route: 'escalate', totalSteps: 0 })
  })
})
