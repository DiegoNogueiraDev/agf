/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §PRD-0200-RPA — Task 4.1: Classificação de dificuldade do cenário.
 *
 * Mapeia um plano compilado (nl-scenario-compiler) para uma ROTA de execução,
 * espelhando os limiares do confidence-gate do browser agent:
 *   deterministic (≥0.9, 0 token) → ai_assisted (≥0.7, delega passos abertos) → escalate (<0.7, revisão).
 * A confiança = média da confiança por-passo (passos resolvidos = 0.9, abertos = 0).
 * Pura — só decide; não executa (não-pivota).
 */

import type { ScenarioPlan } from './nl-scenario-compiler.js'

export type ScenarioRoute = 'deterministic' | 'ai_assisted' | 'escalate'

export interface DifficultyResult {
  /** Confiança média do plano (0–1). */
  confidence: number
  route: ScenarioRoute
  /** Fração de passos resolvidos deterministicamente. */
  resolvedRatio: number
  totalSteps: number
}

const DETERMINISTIC_THRESHOLD = 0.9
const AI_ASSISTED_THRESHOLD = 0.7

/** Classifica a dificuldade/rota de um plano de cenário. Plano vazio → escalate. */
export function classifyDifficulty(plan: Pick<ScenarioPlan, 'steps'>): DifficultyResult {
  const total = plan.steps.length
  if (total === 0) {
    return { confidence: 0, route: 'escalate', resolvedRatio: 0, totalSteps: 0 }
  }
  const resolved = plan.steps.filter((s) => !s.needsDelegation).length
  const resolvedRatio = Math.round((resolved / total) * 1000) / 1000
  const confidence = Math.round((plan.steps.reduce((acc, s) => acc + s.confidence, 0) / total) * 1000) / 1000

  const route: ScenarioRoute =
    confidence >= DETERMINISTIC_THRESHOLD
      ? 'deterministic'
      : confidence >= AI_ASSISTED_THRESHOLD
        ? 'ai_assisted'
        : 'escalate'

  return { confidence, route, resolvedRatio, totalSteps: total }
}
