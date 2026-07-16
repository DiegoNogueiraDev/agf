/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-21.T11 — agent-budget-precheck.
 * Pure function: detecta quando consumo está próximo do cap (default 90%).
 * Wired no canal agent:pre-spawn para warn antes do spawn que pode estourar
 * o budget. Cap real é avaliado pelo BudgetLedger no momento da chamada LLM
 * (EPIC 16); este hook é early-warning advisory.
 */

export const BUDGET_LOW_THRESHOLD = 0.9

export interface BudgetCheckInput {
  currentUsd: number
  capUsd: number | undefined
}

/** isBudgetLow —  */
export function isBudgetLow(input: BudgetCheckInput, threshold: number = BUDGET_LOW_THRESHOLD): boolean {
  if (input.capUsd === undefined || input.capUsd <= 0) return false
  return input.currentUsd / input.capUsd > threshold
}
