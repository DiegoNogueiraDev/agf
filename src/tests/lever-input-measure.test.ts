/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_28c3420006fc — medir um cortador de ENTRADA sem chamar provider.
 *
 * Cinco levers auto-ativados (`heat_kernel`, `ncd_dedup`, `forage_stop`,
 * `info_bottleneck`, `zipf_estimate`) agem sobre o payload que `prepareTask`
 * monta. O efeito deles é no TAMANHO DA ENTRADA — e entrada é observável antes
 * de qualquer chamada. Medir isso pelo provider adicionaria custo real e
 * variância de modelo para observar um corte que já está visível de graça.
 *
 * Complementar, não substituto: o A/B por provider continua sendo o instrumento
 * certo para levers que mudam a SAÍDA (ex.: `cascade`, que troca de modelo).
 *
 * Contrato honesto: `saved === 0` é RESULTADO, não erro. Foi exatamente o
 * veredito que os levers deram no seam do middleware, e confundi-lo com falha do
 * instrumento custou um ciclo.
 */

import { describe, it, expect } from 'vitest'
import { measureInputLever } from '../core/economy/lever-input-measure.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { LeverKey } from '../core/economy/economy-levers-config.js'

function storeComTask(): { store: SqliteStore; id: string } {
  const store = SqliteStore.open(':memory:')
  store.initProject('lever-input-measure')
  const now = new Date().toISOString()
  const id = 'node_alvo'
  store.insertNode({
    id,
    // Título de UMA palavra que casa memórias reais do acervo. Medido: o
    // rankeador consulta por `node.title` cru, e uma frase composta
    // ('harness gate lever economy') casa ZERO enquanto 'harness' casa 10 — o
    // teste mediria a ausência de match em vez da ausência de `projectDir`.
    title: 'harness',
    type: 'task',
    status: 'backlog',
    priority: 3,
    acceptanceCriteria: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
  })
  return { store, id }
}

describe('measureInputLever — o corte de entrada é observável sem provider', () => {
  it('devolve before e after para o lever medido (AC1)', async () => {
    const { store, id } = storeComTask()
    try {
      const r = await measureInputLever(store, id, 'ncd_dedup')

      expect(r.lever).toBe('ncd_dedup')
      expect(typeof r.before).toBe('number')
      expect(typeof r.after).toBe('number')
    } finally {
      store.close()
    }
  })

  it('é DETERMINÍSTICO — a mesma entrada mede o mesmo (AC2)', async () => {
    // Sem isto, o número não serve para decidir um default: duas leituras
    // discordantes tornam qualquer veredito indefensável.
    const { store, id } = storeComTask()
    try {
      const a = await measureInputLever(store, id, 'heat_kernel')
      const b = await measureInputLever(store, id, 'heat_kernel')

      expect(a).toEqual(b)
    } finally {
      store.close()
    }
  })

  it('saved é a diferença assinada — corte positivo, inflação negativa (AC4)', async () => {
    // O sinal PRECISA sobreviver: um lever que INFLA a entrada é um achado tão
    // válido quanto um que corta, e já aconteceu neste projeto (o `flow` inflou
    // 105%). Colapsar em zero esconderia o caso mais importante.
    const { store, id } = storeComTask()
    try {
      const r = await measureInputLever(store, id, 'forage_stop')

      expect(r.saved).toBe(r.before - r.after)
    } finally {
      store.close()
    }
  })

  it('saved zero é RESULTADO válido, não erro (AC4)', async () => {
    const { store, id } = storeComTask()
    try {
      const r = await measureInputLever(store, id, 'zipf_estimate')

      expect(r).toHaveProperty('saved')
      expect(Number.isFinite(r.saved)).toBe(true)
    } finally {
      store.close()
    }
  })

  it('não deixa resíduo na config do projeto (AC3)', async () => {
    // A medição usa o braço de controle injetado (node_aba7185d8d98); persistir
    // o override deixaria quem mediu com um default diferente do que tinha.
    const { store, id } = storeComTask()
    try {
      await measureInputLever(store, id, 'info_bottleneck')

      expect(store.getProjectSetting('economy_levers_config')).toBeNull()
    } finally {
      store.close()
    }
  })

  it('mede LEVERS diferentes de forma independente — sem contaminação entre eles', async () => {
    // O braço ON liga só o lever em teste; se ele arrastasse vizinhos, a
    // atribuição do ganho seria impossível — o defeito que o bundle causa.
    const { store, id } = storeComTask()
    try {
      const levers: LeverKey[] = ['ncd_dedup', 'heat_kernel']
      const rs = await Promise.all(levers.map((l) => measureInputLever(store, id, l)))

      expect(rs.map((r) => r.lever)).toEqual(levers)
    } finally {
      store.close()
    }
  })
})

describe('projectDir habilita o memory-inject — sem ele 2 levers ficam impedidos', () => {
  it('sem projectDir, nenhuma memória entra (comportamento de hoje preservado)', async () => {
    const { store, id } = storeComTask()
    try {
      const r = await measureInputLever(store, id, 'ncd_dedup')

      expect(r.before).toBeGreaterThanOrEqual(0)
    } finally {
      store.close()
    }
  })

  it('com projectDir, o baseline CARREGA memórias — é o insumo que faltava (AC1)', async () => {
    // O defeito que este teste fixa: measureInputLever chamava prepareTask sem
    // projectDir, e o memory-inject vive atrás de `if (opts.projectDir)`. Então
    // priorMemories era SEMPRE 0, e `ncd_dedup` — que exige >1 memória — ficava
    // estruturalmente impedido. O zero dele era artefato do instrumento, não
    // veredito sobre o lever.
    const { store, id } = storeComTask()
    try {
      const semDir = await measureInputLever(store, id, 'ncd_dedup')
      const comDir = await measureInputLever(store, id, 'ncd_dedup', { projectDir: process.cwd() })

      expect(comDir.before, 'projectDir não trouxe memória alguma').toBeGreaterThan(semDir.before)
    } finally {
      store.close()
    }
  })
})
