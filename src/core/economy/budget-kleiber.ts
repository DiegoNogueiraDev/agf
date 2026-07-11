/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §PRD-0200-SWE — Task 3.2: Lever budget_kleiber (lei de Kleiber, escala 3/4).
 *
 * A taxa metabólica escala com a massa^(3/4) (Kleiber 1932). Aqui, o orçamento
 * de tokens é realocado entre itens proporcionalmente a tamanho^(3/4) — itens
 * grandes recebem MENOS que o proporcional linear (sublinear), liberando budget
 * para os menores. Conserva o total (sem perda de informação). Pura + opt-in.
 */

const KLEIBER_EXPONENT = 0.75

/** Item que consome orçamento, com um "tamanho" (massa). */
export interface BudgetItem {
  id: string
  size: number
}

export interface BudgetAllocation {
  id: string
  budget: number
}

/**
 * Realoca `total` entre os itens ∝ size^(3/4). Conserva o total (Σ budgets = total).
 * Itens de tamanho ≤ 0 recebem 0. Lista vazia ou pesos nulos → tudo 0.
 */
export function allocateKleiber(items: BudgetItem[], total: number): BudgetAllocation[] {
  const weights = items.map((it) => (it.size > 0 ? Math.pow(it.size, KLEIBER_EXPONENT) : 0))
  const sum = weights.reduce((acc, w) => acc + w, 0)
  if (sum === 0) return items.map((it) => ({ id: it.id, budget: 0 }))
  return items.map((it, i) => ({ id: it.id, budget: (total * weights[i]) / sum }))
}
