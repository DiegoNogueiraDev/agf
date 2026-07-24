/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Paridade provider↔delegado (node_a53983db0181): o mesmo juiz determinístico da
 * cascata (cascade-verifier) roda no caminho delegado (agf submit), não só no
 * provider. `buildSubmitVerification` computa o verdict e decide se BLOQUEIA —
 * gate opt-in (`--verify`), default OFF ⇒ envelope byte-idêntico + verdict advisory.
 */

import { describe, it, expect } from 'vitest'
import { buildSubmitVerification } from '../cli/commands/submit-cmd.js'

const AC = [
  'Given o ledger com linhas, When calculo savings, Then o total bate com a soma',
  'Given a janela vazia, When calculo burnrate, Then retorna zero',
]

const COVERS = JSON.stringify({
  arquivos: ['src/core/economy/savings-tracker.ts'],
  testes: { passed: 3, failed: 0 },
  desvios: ['ajustei o calculo de savings/ledger e o burnrate na janela vazia'],
})
const IGNORES = JSON.stringify({
  arquivos: ['src/foo/bar.ts'],
  testes: { passed: 1, failed: 0 },
  desvios: [],
})

describe('buildSubmitVerification', () => {
  it('gate OFF (default) => nunca bloqueia, mesmo com AC não coberto (byte-idêntico)', () => {
    const v = buildSubmitVerification(IGNORES, AC, { gate: false, threshold: 0.6 })
    expect(v.blocked).toBe(false)
    expect(v.verdict).toBeDefined()
  })

  it('AC1: gate ON + resultado que não cobre keywords do AC (score<threshold) => blocked com reasons', () => {
    const v = buildSubmitVerification(IGNORES, AC, { gate: true, threshold: 0.9 })
    expect(v.blocked).toBe(true)
    expect(v.verdict.pass).toBe(false)
    expect(v.verdict.reasons.length).toBeGreaterThanOrEqual(1)
  })

  it('AC2: gate ON + resultado que cobre o AC e passa o verificador => não bloqueia', () => {
    const v = buildSubmitVerification(COVERS, AC, { gate: true, threshold: 0.6 })
    expect(v.blocked).toBe(false)
    expect(v.verdict.pass).toBe(true)
  })

  it('sem acLines (node sem AC) => nunca bloqueia (nada a cobrar)', () => {
    const v = buildSubmitVerification(IGNORES, [], { gate: true, threshold: 0.9 })
    expect(v.blocked).toBe(false)
  })
})
