/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Testes da lever cascade (A.T3 — node_d69da48f87ff).
 * OFF ⇒ policy null ⇒ nenhum consumidor roda a cascata (byte-idêntico).
 * ON ⇒ prova de custo-por-sucesso no cenário stub + rescue-rate por classe
 * com recomendação OFF quando a escalada não paga (achado do FrugalGPT).
 */

import { describe, it, expect } from 'vitest'
import { runCascade } from '../core/model-hub/tier-router.js'
import { resolveCascadePolicy, computeRescueRate } from '../core/model-hub/cascade-policy.js'
import { ECONOMY_LEVERS_SETTING_KEY } from '../core/economy/economy-levers-config.js'

function settingsWith(cfg: Record<string, unknown>): { getProjectSetting(key: string): string | null } {
  return {
    getProjectSetting(key: string): string | null {
      return key === ECONOMY_LEVERS_SETTING_KEY ? JSON.stringify(cfg) : null
    },
  }
}

describe('resolveCascadePolicy — a lever gate', () => {
  it('AC1: lever OFF (default) => policy null => cascata nunca roda (byte-identico)', () => {
    expect(resolveCascadePolicy(settingsWith({}))).toBeNull()
    expect(resolveCascadePolicy(settingsWith({ cascade: { enabled: false } }))).toBeNull()
  })

  it('lever ON => policy com tiers barato->caro e maxEscalations default 1', () => {
    const policy = resolveCascadePolicy(settingsWith({ cascade: { enabled: true } }))
    expect(policy).not.toBeNull()
    expect(policy!.tiers.length).toBeGreaterThanOrEqual(2)
    expect(policy!.maxEscalations).toBe(1)
  })
})

describe('AC2: custo-por-sucesso no cenario stub — cascata <= 60% do baseline com resolve% igual', () => {
  const CHEAP_COST = 1
  const FRONTIER_COST = 10
  const TASKS = 20

  it('20 tasks stub: 80% resolvem no barato => custo-por-sucesso cai abaixo de 60% do baseline', async () => {
    // Arrange — policy real vinda da lever ON
    const policy = resolveCascadePolicy(settingsWith({ cascade: { enabled: true } }))!

    // Baseline: toda task direto no tier caro
    const baselineCost = TASKS * FRONTIER_COST
    const baselineResolved = TASKS

    // Cascata: task i com i%5!==0 passa no barato; as demais escalam e passam no caro
    let cascadeCost = 0
    let cascadeResolved = 0
    for (let i = 0; i < TASKS; i += 1) {
      const outcome = await runCascade({
        tiers: policy.tiers,
        maxEscalations: policy.maxEscalations,
        call: async (model) => {
          cascadeCost += model === policy.tiers[0] ? CHEAP_COST : FRONTIER_COST
          return { text: `draft-${model}-task${i}` }
        },
        verify: (text) =>
          text.includes(policy.tiers[0]) && i % 5 === 0
            ? { pass: false, score: 0.3, reasons: ['fraco'] }
            : { pass: true, score: 1, reasons: [] },
      })
      if (outcome.verdict.pass) cascadeResolved += 1
    }

    // Assert — resolve% igual, custo-por-sucesso <= 60% do baseline
    expect(cascadeResolved).toBe(baselineResolved)
    const costPerSuccessBaseline = baselineCost / baselineResolved
    const costPerSuccessCascade = cascadeCost / cascadeResolved
    expect(costPerSuccessCascade).toBeLessThanOrEqual(0.6 * costPerSuccessBaseline)
  })
})

describe('AC3: rescue-rate por classe de task com recomendacao OFF', () => {
  it('classe onde cheap e caro falham juntos (rescue 0%) gera recommendOff', () => {
    // Arrange — 10 escaladas da classe hard, nenhuma resgatada; classe easy resgata 4/5
    const entries = [
      ...Array.from({ length: 10 }, (_, i) => ({ taskClass: 'hard', rescued: false, id: `h${i}` })),
      ...Array.from({ length: 5 }, (_, i) => ({ taskClass: 'easy', rescued: i > 0, id: `e${i}` })),
    ]

    // Act
    const report = computeRescueRate(entries)

    // Assert
    const hard = report.byClass.find((c) => c.taskClass === 'hard')!
    const easy = report.byClass.find((c) => c.taskClass === 'easy')!
    expect(hard.total).toBe(10)
    expect(hard.rate).toBe(0)
    expect(hard.recommendOff).toBe(true)
    expect(easy.rate).toBeCloseTo(0.8, 6)
    expect(easy.recommendOff).toBe(false)
  })

  it('sem escaladas => relatorio vazio sem excecao', () => {
    const report = computeRescueRate([])
    expect(report.byClass.length).toBe(0)
  })
})
