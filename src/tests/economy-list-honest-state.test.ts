/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_0b96f1ced50c — `agf economy list` mentia sobre o que está rodando.
 *
 * O comando lia `resolveEconomyLeversConfig` (a config PERSISTIDA) e reportava
 * `enabled: false`. Mas `resolveEffectiveLevers` liga o bundle loss-safe sempre
 * que um agente dirige (decisão deliberada — node_7ee81fd6a5e0), então cinco
 * levers estavam EFETIVAMENTE ativos enquanto a superfície dizia que não.
 * Medido: `forage_stop`, `ncd_dedup`, `heat_kernel`, `info_bottleneck` e
 * `zipf_estimate` rodando, todos exibidos como desligados.
 *
 * Uma superfície que reporta o estado errado é pior que uma ausente: quem lê
 * toma decisão com base nela. E este projeto passou a sessão inteira corrigindo
 * exatamente essa classe de defeito.
 *
 * O contrato acrescenta `source`, porque "ligado" tem duas causas com
 * consequências diferentes: quem ligou à mão pode desligar; quem recebeu do
 * bundle nem sabe que está ligado.
 */

import { describe, it, expect } from 'vitest'
import { leverListState } from '../core/economy/lever-list-state.js'
import type { EconomyLeversConfig } from '../core/economy/economy-levers-config.js'

const VAZIA: EconomyLeversConfig = {}

describe('leverListState — a lista reflete o que ESTÁ rodando (node_0b96f1ced50c)', () => {
  it('lever efetivo pelo bundle aparece enabled, não desligado', () => {
    // O defeito exato: a superfície dizia false para algo que estava on.
    const s = leverListState('forage_stop', VAZIA, { forage_stop: { enabled: true } })

    expect(s.enabled).toBe(true)
  })

  it('distingue quem foi ligado À MÃO de quem veio do bundle', () => {
    // Sem a distinção, o usuário não sabe se PODE desligar aquilo, nem por que
    // está ligado — e o bundle é justamente o que ele não escolheu.
    const manual = leverListState('forage_stop', { forage_stop: { enabled: true } }, { forage_stop: { enabled: true } })
    const auto = leverListState('forage_stop', VAZIA, { forage_stop: { enabled: true } })

    expect(manual.source).toBe('config')
    expect(auto.source).toBe('auto-bundle')
  })

  it('lever desligado nos dois reporta enabled false e source none', () => {
    const s = leverListState('cascade', VAZIA, {})

    expect(s.enabled).toBe(false)
    expect(s.source).toBe('none')
  })

  it('config do usuário vence na atribuição quando ambos ligam', () => {
    // Se o usuário ligou explicitamente, a origem é a escolha dele — mesmo que o
    // bundle também ligasse. Atribuir ao bundle esconderia a decisão do operador.
    const s = leverListState('ncd_dedup', { ncd_dedup: { enabled: true } }, { ncd_dedup: { enabled: true } })

    expect(s.source).toBe('config')
  })

  it('um lever DESLIGADO à mão não é reportado como ligado pelo bundle', () => {
    // Guarda de honestidade inversa: se o efetivo diz off, a lista diz off.
    const s = leverListState('heat_kernel', { heat_kernel: { enabled: false } }, {})

    expect(s.enabled).toBe(false)
  })
})
