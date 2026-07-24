/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_f6183a36eaf9 — o custo do A/B saía ZERO.
 *
 * O tier-router roteia para três modelos da OpenRouter
 * (`tier-router.ts`: cheap/build/frontier), e NENHUM tinha preço no
 * `MODEL_CATALOG`. Como `armCostUsd` só cobra quando o modelo está catalogado —
 * e cair no preço default seria cobrar pelo modelo errado —, todo veredito de
 * A/B saía com `costUsd: 0` e o `llm_call_ledger` gravava `0.0` mesmo em
 * chamadas reais (medido: 110 linhas, todas zeradas).
 *
 * Os valores vieram da API pública da OpenRouter (`/api/v1/models`), não de
 * estimativa: um preço inventado produz exatamente o número-que-parece-medido
 * que este projeto passou a sessão inteira caçando.
 */

import { describe, it, expect } from 'vitest'
import { MODEL_CATALOG } from '../core/llm/model-capabilities.js'
import { OPENROUTER_TIER_MAP } from '../core/model-hub/tier-router.js'

/** Os modelos para onde o tier-router realmente roteia em cada tier. */
const ROUTED = ['deepseek/deepseek-v4-flash', 'meta-llama/llama-4-maverick', 'qwen/qwen3.6-plus']

describe('todo modelo roteado tem preço — senão o custo medido é zero', () => {
  it.each(ROUTED)('%s está no MODEL_CATALOG', (id) => {
    expect(MODEL_CATALOG[id], `${id} sem preço → custo do A/B sai 0`).toBeDefined()
  })

  it.each(ROUTED)('%s tem preço de entrada E de saída maiores que zero', (id) => {
    const p = MODEL_CATALOG[id]?.pricingPer1kTokens
    expect(p?.input).toBeGreaterThan(0)
    expect(p?.output).toBeGreaterThan(0)
  })

  it('saída custa mais que entrada — a assimetria que torna o custo de geração dominante', () => {
    // Se algum preço for transcrito trocado, este invariante pega: em todo
    // provider de mercado o token gerado é mais caro que o lido.
    for (const id of ROUTED) {
      const p = MODEL_CATALOG[id].pricingPer1kTokens
      expect(p.output, `${id}: saída não é mais cara que entrada — preço trocado?`).toBeGreaterThan(p.input)
    }
  })

  it('o tier cheap é mais barato que o frontier — senão o roteamento por custo é fantasia', () => {
    // O tier-router escolhe modelo por tier para economizar. Se o "barato" não
    // for barato, toda a economia do roteamento é alegação sem lastro.
    const cheap = MODEL_CATALOG['deepseek/deepseek-v4-flash'].pricingPer1kTokens
    const frontier = MODEL_CATALOG['qwen/qwen3.6-plus'].pricingPer1kTokens

    expect(cheap.input).toBeLessThan(frontier.input)
    expect(cheap.output).toBeLessThan(frontier.output)
  })

  it('TODO tier do OPENROUTER_TIER_MAP aponta para um modelo com preço', () => {
    // Guarda de drift, sobre a fonte AUTORITATIVA do roteamento: trocar o modelo
    // de um tier sem catalogar o novo faria o custo voltar a zero em silêncio —
    // que é exatamente como este bug nasceu. Iterar o mapa (em vez de uma lista
    // fixa) garante que um tier NOVO também seja cobrado.
    for (const [tier, id] of Object.entries(OPENROUTER_TIER_MAP)) {
      expect(MODEL_CATALOG[id], `tier '${tier}' roteia para ${id}, que não tem preço → custo 0`).toBeDefined()
    }
  })
})
