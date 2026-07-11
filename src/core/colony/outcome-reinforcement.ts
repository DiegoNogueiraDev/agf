/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §PRD-0200-SWE — Task 2.1: Loop de reforço ACO (feedback resultado → feromônio).
 *
 * Fecha o feedback que faltava: o RESULTADO de uma task (sucesso, harnessDelta,
 * DoD grade) decide o reforço Δτ da trilha de feromônio. ACO: sucesso deposita
 * (base + bônus); falha NÃO deposita (Δτ=0) → a trilha evapora naturalmente
 * (convenção do pheromone-store: sem reforço negativo). Pura + injetável.
 */

/** Resultado de uma task concluída, base para o reforço. */
export interface TaskOutcome {
  success: boolean
  /** Variação de harness (pontos). Bônus só quando > 0. */
  harnessDelta?: number
  /** DoD grade (A melhor). */
  dodGrade?: string
}

const BASE_DEPOSIT = 1.0
const HARNESS_BONUS_CAP = 10
const GRADE_BONUS: Record<string, number> = { A: 0.5, B: 0.2 }

/**
 * Δτ (ACO): quanto reforçar a trilha dado o resultado.
 * Falha → 0 (sem reforço negativo; deixa evaporar). Sucesso → base + bônus de
 * harnessDelta (até +1.0) + bônus de grade (A=+0.5, B=+0.2).
 */
export function computeReinforcementAmount(outcome: TaskOutcome): number {
  if (!outcome.success) return 0
  let amount = BASE_DEPOSIT
  if (typeof outcome.harnessDelta === 'number' && outcome.harnessDelta > 0) {
    amount += Math.min(outcome.harnessDelta, HARNESS_BONUS_CAP) / HARNESS_BONUS_CAP
  }
  amount += GRADE_BONUS[(outcome.dodGrade ?? '').toUpperCase()] ?? 0
  return Math.round(amount * 1000) / 1000
}

/** Função de depósito injetável (real: depositPheromone(db, projectId, key, amount, …)). */
export type DepositFn = (key: string, amount: number) => void

/**
 * Reforça a trilha `key` a partir do resultado da task. Deposita só quando Δτ>0
 * (sucesso). Retorna o Δτ aplicado (0 quando falhou). Não lança.
 */
export function reinforceFromOutcome(deposit: DepositFn, key: string, outcome: TaskOutcome): number {
  const amount = computeReinforcementAmount(outcome)
  if (amount > 0) deposit(key, amount)
  return amount
}
