/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_216d6c3c206c — a guarda que precisa sobreviver a qualquer rebaseline.
 *
 * A task pedia recapturar o baseline "quando E2 ligar um lever por default".
 * Verificado antes de implementar: NENHUM lever tem veredito `enable` no
 * `lever_ab_verdict` — a condição nunca disparou, e construir a máquina de
 * rebaseline para um estado que não ocorreu seria especulação (YAGNI).
 *
 * O que É verificável agora, e é a parte que dá valor à task, é o invariante que
 * qualquer rebaseline futuro precisa preservar: depois de recapturar o baseline,
 * uma regressão REAL de custo ainda tem de REPROVAR. Um rebaseline que engole a
 * regressão junto transforma o gate em decoração — e um gate que não morde é
 * pior que nenhum, porque dá confiança falsa.
 *
 * Provado por sabotagem: injeta-se um custo acima da tolerância e exige-se que o
 * gate reprove; abaixo dela, que aprove.
 */

import { describe, it, expect } from 'vitest'
import { checkEconomyRegressionGate, costPerSuccessMap } from '../core/evals/economy-regression-gate.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'agf-econ-gate-'))
}

/**
 * Uma linha de scorecard com o custo-por-sucesso desejado.
 *
 * O campo é `costPerSuccess` — `costPerSuccessMap` lê ESSE nome e ignora o resto.
 * Preencher `costUsd` (o nome intuitivo) produz um mapa VAZIO, o laço de
 * comparação não itera, e o gate "passa" sem ter comparado nada. Foi assim que
 * este teste acusou um falso defeito no gate antes de eu conferir a fixture.
 */
function row(model: string, costPerSuccess: number) {
  return { model, resolved: 1, total: 1, costPerSuccess } as never
}

/** O gate recebe um MAPA modelo→custo, não a lista de linhas do scorecard. */
function mapa(model: string, costPerSuccess: number): Record<string, number> {
  return costPerSuccessMap([row(model, costPerSuccess)])
}

describe('o gate de regressão de custo MORDE (node_216d6c3c206c)', () => {
  it('a primeira execução cria o baseline e passa — não há com o que comparar', () => {
    const dir = tempDir()
    try {
      const r = checkEconomyRegressionGate(dir, mapa('m', 1), 0.1)

      expect(r.code).toBe('BASELINE_CREATED')
      expect(r.passed).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('REPROVA quando o custo sobe acima da tolerância — a sabotagem', () => {
    // O invariante que qualquer rebaseline precisa preservar. Se isto parar de
    // reprovar, o gate virou decoração e ninguém percebe.
    const dir = tempDir()
    try {
      checkEconomyRegressionGate(dir, mapa('m', 1), 0.1)
      const r = checkEconomyRegressionGate(dir, mapa('m', 1.5), 0.1)

      expect(r.passed, 'custo subiu 50% e o gate aprovou').toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('APROVA uma variação dentro da tolerância — senão o gate vira ruído', () => {
    // A contraprova: um gate que reprova qualquer oscilação seria desligado pela
    // primeira pessoa que o encontrasse vermelho sem motivo.
    const dir = tempDir()
    try {
      checkEconomyRegressionGate(dir, mapa('m', 1), 0.1)
      const r = checkEconomyRegressionGate(dir, mapa('m', 1.05), 0.1)

      expect(r.passed).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('uma QUEDA de custo nunca reprova — economia não é regressão', () => {
    const dir = tempDir()
    try {
      checkEconomyRegressionGate(dir, mapa('m', 1), 0.1)
      const r = checkEconomyRegressionGate(dir, mapa('m', 0.4), 0.1)

      expect(r.passed).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('linha SEM costPerSuccess não entra no mapa — e o gate não compara o que não tem', () => {
    // O comportamento que me enganou, agora fixado: a ausência do campo produz
    // mapa vazio em silêncio. Quem monta o scorecard precisa saber disso, senão
    // acredita num verde que não comparou nada.
    const m = costPerSuccessMap([{ model: 'm', resolved: 1, total: 1, costUsd: 5 } as never])

    expect(Object.keys(m)).toEqual([])
  })
})
