/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_aba7185d8d98 — medir um lever sem escrever na config de quem usa.
 *
 * Cinco levers (`heat_kernel`, `ncd_dedup`, `forage_stop`, `info_bottleneck`,
 * `zipf_estimate`) agem dentro do `prepareTask`, que resolve a config via
 * `resolveEffectiveLevers(store)` — sem parâmetro. Medir o efeito de um deles
 * exigiria, hoje, ESCREVER na config persistida do projeto: o usuário terminaria
 * o experimento com um default diferente do que tinha. Foi por essa mesma razão
 * que o executor do A/B passou a usar um DB de rascunho.
 *
 * Há um segundo motivo, mais grave, para esta costura existir: aquele resolvedor
 * liga o bundle loss-safe INCONDICIONALMENTE quando um agente dirige
 * (node_7665ce2ed19d). Sem um jeito de desligar isso por chamada, os dois braços
 * de qualquer A/B recebem os 5 levers ligados e a medição dá zero por
 * confundimento — um resultado que parece "o lever não serve" e na verdade é
 * "o experimento nunca teve braço de controle".
 *
 * Contrato: override ausente ⇒ comportamento byte-idêntico ao de hoje.
 */

import { describe, it, expect } from 'vitest'
import { resolveEffectiveLevers, resolveLeversForRun } from '../core/autonomy/task-prep.js'
import type { EconomyLeversConfigSource } from '../core/economy/economy-levers-config.js'
import { prepareTask } from '../core/autonomy/task-prep.js'
import { SqliteStore } from '../core/store/sqlite-store.js'

/** Fonte sem nada persistido — o caso do projeto recém-criado. */
const vazia: EconomyLeversConfigSource = { getProjectSetting: () => null }

/** Levers efetivos, como nomes, para asserção legível. */
function ligados(cfg: Record<string, { enabled: boolean }>): string[] {
  return Object.keys(cfg)
    .filter((k) => cfg[k].enabled)
    .sort()
}

describe('resolveLeversForRun — o override é o braço de controle (node_aba7185d8d98)', () => {
  it('sem override, devolve exatamente o que resolveEffectiveLevers devolve (AC1)', () => {
    // A garantia de byte-identidade: quem não passa override não muda de
    // comportamento, então nenhum caminho existente regride.
    expect(resolveLeversForRun(vazia)).toEqual(resolveEffectiveLevers(vazia))
  })

  it('um override vazio NEUTRALIZA o bundle auto-ativado (AC2)', () => {
    // O ponto central. Com agente dirigindo, resolveEffectiveLevers liga 5
    // levers sem consultar evidência alguma; sem poder desligá-los por chamada,
    // um A/B mede zero por confundimento, não por ausência de efeito.
    expect(ligados(resolveLeversForRun(vazia, {}))).toEqual([])
  })

  it('um override com UM lever deixa apenas aquele efetivo (AC3)', () => {
    const cfg = resolveLeversForRun(vazia, { heat_kernel: { enabled: true } })

    expect(ligados(cfg)).toEqual(['heat_kernel'])
  })

  it('o override não é contaminado pelo bundle mesmo quando liga um lever do bundle', () => {
    // ncd_dedup PERTENCE ao bundle loss-safe. Ligá-lo explicitamente não pode
    // arrastar os outros quatro junto — senão o braço "só ncd_dedup" na verdade
    // testa cinco levers e a atribuição do ganho fica impossível.
    const cfg = resolveLeversForRun(vazia, { ncd_dedup: { enabled: true } })

    expect(ligados(cfg)).toEqual(['ncd_dedup'])
  })

  it('não escreve na fonte — um experimento não muda o estado de quem o roda (AC4)', () => {
    // Guarda de efeito colateral: a fonte é só de leitura por contrato, e uma
    // implementação que "aplicasse" o override persistindo-o passaria nos testes
    // acima e corromperia o projeto do usuário.
    const escritas: string[] = []
    const espia: EconomyLeversConfigSource = {
      getProjectSetting: () => null,
      // @ts-expect-error — a fonte de leitura não declara escrita; se alguém
      // chamar isto, o teste registra e falha.
      setProjectSetting: (k: string) => escritas.push(k),
    }

    resolveLeversForRun(espia, { heat_kernel: { enabled: true } })

    expect(escritas, 'resolveLeversForRun persistiu o override').toEqual([])
  })
})

describe('o override CHEGA ao prepareTask — sem isso a costura é dormente', () => {
  it('prepareTask aceita o override e ele governa a execução', async () => {
    // Prova no consumidor: não basta o resolvedor estar certo se prepareTask
    // continuar lendo a config por fora. `pheromoneTrails` é o observável do
    // contrato — vazio a menos que o lever `stigmergy` esteja efetivo.
    const store = SqliteStore.open(':memory:')
    store.initProject('override-test')
    try {
      const now = new Date().toISOString()
      store.insertNode({
        id: 'node_medir',
        title: 'medir lever',
        type: 'task',
        status: 'backlog',
        priority: 3,
        acceptanceCriteria: [],
        tags: [],
        createdAt: now,
        updatedAt: now,
      })
      const ref = { id: 'node_medir', title: 'medir lever', description: 'x' }

      const desligado = await prepareTask(store, ref, { leversOverride: {} })

      expect(desligado.pheromoneTrails, 'override vazio deixou stigmergy agir').toEqual([])
    } finally {
      store.close()
    }
  })
})
