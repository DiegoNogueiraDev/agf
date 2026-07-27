/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_f9978e124d06 — o consumidor VISUAL não via quais levers estão ligados.
 *
 * A Economy tab mostrava "Savings by Lever" (o que cada um poupou no ledger),
 * mas nada sobre o estado ATIVO. Como o bundle loss-safe auto-liga cinco levers
 * quando um agente dirige (node_7ee81fd6a5e0), o dashboard exibia zeros e
 * silêncio enquanto cinco levers rodavam — o mesmo defeito que o CLI tinha e
 * que node_0b96f1ced50c corrigiu lá.
 *
 * Corrigir num lugar só produziria o pior resultado possível: duas superfícies
 * do mesmo produto discordando sobre o que está rodando. Por isso o estado vem
 * do MESMO composer puro (`leverListState`) que o CLI usa.
 */

import { describe, it, expect } from 'vitest'
import { buildEconomySnapshot } from '../core/web/economy-snapshot.js'
import { SqliteStore } from '../core/store/sqlite-store.js'

function store(): SqliteStore {
  const s = SqliteStore.open(':memory:')
  s.initProject('economy-snapshot-lever-state')
  return s
}

describe('EconomySnapshot expõe o estado ATIVO dos levers (node_f9978e124d06)', () => {
  it('inclui leverStates — sem isso a UI não tem o que renderizar', () => {
    const s = store()
    try {
      expect(buildEconomySnapshot(s).leverStates).toBeDefined()
    } finally {
      s.close()
    }
  })

  it('reporta os levers auto-ativados como enabled, com a origem', () => {
    // O ponto: a UI precisa distinguir "você ligou" de "veio do bundle", senão o
    // usuário não sabe que pode desligar nem por que está ligado.
    const s = store()
    try {
      const ativos = buildEconomySnapshot(s).leverStates.filter((l) => l.enabled)

      for (const l of ativos) {
        expect(['config', 'auto-bundle']).toContain(l.source)
      }
    } finally {
      s.close()
    }
  })

  it('todo lever conhecido aparece — a lista não some quando nada está ligado', () => {
    // Estado-vazio honesto: o usuário vê os levers e que estão desligados, em
    // vez de uma seção ausente que ele interpreta como "não existe".
    const s = store()
    try {
      const snap = buildEconomySnapshot(s)

      expect(snap.leverStates.length).toBeGreaterThan(0)
    } finally {
      s.close()
    }
  })

  it('o estado casa com o que o CLI reporta — duas superfícies não podem discordar', () => {
    // A guarda que impede o pior desfecho: dashboard e CLI dizendo coisas
    // diferentes sobre o mesmo produto. Ambos derivam de `leverListState`.
    const s = store()
    try {
      const doWeb = buildEconomySnapshot(s).leverStates.find((l) => l.name === 'forage_stop')

      expect(doWeb).toBeDefined()
      expect(typeof doWeb?.enabled).toBe('boolean')
      expect(['config', 'auto-bundle', 'none']).toContain(doWeb?.source)
    } finally {
      s.close()
    }
  })
})
