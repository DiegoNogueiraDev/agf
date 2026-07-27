/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes do verificador determinístico da cascata (A.T1 — node_9c91ee7f6240).
 * A cascata só é segura se aceitar/reprovar o draft barato custe ZERO tokens:
 * schema-parse (hard gate) + cobertura de keywords do AC + limites de formato.
 */

import { describe, it, expect } from 'vitest'
import { verifyCascadeResponse } from '../core/llm/cascade-verifier.js'

const VALID_JSON = JSON.stringify({
  arquivos: ['src/core/economy/savings-tracker.ts'],
  testes: { passed: 5, failed: 0 },
  desvios: [],
})

const AC_LINES = [
  'Given o ledger com linhas, When calculo savings, Then o total bate com a soma',
  'Given janela vazia, When calculo, Then retorna zero sem excecao',
]

describe('verifyCascadeResponse', () => {
  it('AC1: resposta valida (JSON parseavel + keywords do AC presentes) passa com score >= threshold', () => {
    // Arrange — resposta que ecoa termos do AC
    const response = `${VALID_JSON}\nCobri ledger, savings, total, soma, janela e excecao com testes.`

    // Act
    const verdict = verifyCascadeResponse(response, { acLines: AC_LINES, expectJson: true })

    // Assert
    expect(verdict.pass).toBe(true)
    expect(verdict.score).toBeGreaterThanOrEqual(0.6)
    expect(verdict.reasons.length).toBe(0)
  })

  it('AC2: JSON invalido reprova com reasons contendo schema-parse', () => {
    const verdict = verifyCascadeResponse('{ arquivos: sem aspas, quebrado', {
      acLines: AC_LINES,
      expectJson: true,
    })
    expect(verdict.pass).toBe(false)
    expect(verdict.reasons.some((r) => r.includes('schema-parse'))).toBe(true)
  })

  it('AC3: a mesma resposta duas vezes produz veredito identico (determinismo, zero LLM)', () => {
    const response = `${VALID_JSON}\nledger savings total soma janela excecao`
    const a = verifyCascadeResponse(response, { acLines: AC_LINES, expectJson: true })
    const b = verifyCascadeResponse(response, { acLines: AC_LINES, expectJson: true })
    expect(a).toEqual(b)
  })

  it('AC4: threshold 0.9 com resposta que pontua menos reprova', () => {
    // Arrange — JSON ok mas cobertura de AC fraca (quase nenhum termo)
    const response = `${VALID_JSON}\nfeito.`

    // Act
    const verdict = verifyCascadeResponse(response, { acLines: AC_LINES, expectJson: true, threshold: 0.9 })

    // Assert
    expect(verdict.score).toBeLessThan(0.9)
    expect(verdict.pass).toBe(false)
  })

  it('resposta vazia reprova com reason de limite', () => {
    const verdict = verifyCascadeResponse('', { acLines: AC_LINES })
    expect(verdict.pass).toBe(false)
    expect(verdict.reasons.length).toBeGreaterThanOrEqual(1)
  })

  it('sem expectJson o schema nao e exigido — limites e AC decidem', () => {
    const verdict = verifyCascadeResponse('Implementei ledger savings total soma janela excecao.', {
      acLines: AC_LINES,
    })
    expect(verdict.pass).toBe(true)
  })
})
