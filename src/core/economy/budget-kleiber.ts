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

/** Synthetic item id representing "the current session/window" in the Kleiber split. */
const WINDOW_ITEM_ID = '__window__'

/**
 * Deriva o alvo do governador (tokens/min) a partir do orçamento declarado, sem
 * decisão do driver — a pureza estigmérgica que o docblock de `budget-governor.ts`
 * (targetRate = budget restante ÷ tempo restante) documenta mas nunca calculava.
 *
 * A janela atual entra como UM item Kleiber (massa = seus minutos) disputando o
 * `budgetTokens` contra o backlog pendente (massa = estimateMinutes). A fatia
 * sublinear da janela ÷ seus minutos = a taxa alvo: com backlog cheio a janela
 * abocanha menos budget e o alvo aperta; sem backlog ela leva o total (degradação
 * limpa = budgetTokens ÷ minutos-da-janela). Null quando nada foi declarado
 * (budget ≤ 0) ou não há janela (windowMs ≤ 0) — o no-op honesto de hoje.
 */
export function deriveTargetRatePerMin(
  budgetTokens: number,
  windowMs: number,
  pendingItems: BudgetItem[],
): number | null {
  if (!(budgetTokens > 0) || !(windowMs > 0)) return null
  const windowMinutes = windowMs / 60_000
  const allocations = allocateKleiber([{ id: WINDOW_ITEM_ID, size: windowMinutes }, ...pendingItems], budgetTokens)
  const windowBudget = allocations[0].budget
  return windowBudget / windowMinutes
}
