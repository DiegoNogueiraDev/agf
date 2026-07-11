/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §PRD-0200-RPA — Task 5.1: Oráculo de resultado + evidências de cenário.
 *
 * Dado o resultado dos passos de um cenário, decide o veredito (passed|failed) e
 * monta a sequência de eventos (started/step/evidence/passed|failed) para o
 * event-store do agf. Puro/determinístico; a emissão ao vivo reusa o
 * browser-harness-bridge. Não-pivota (não executa browser).
 */

/** Resultado de um passo executado. */
export interface StepResult {
  tool: string
  ok: boolean
  /** Referência de evidência (screenshot/network), se houver. */
  evidence?: string
}

export interface ScenarioVerdict {
  verdict: 'passed' | 'failed'
  passedSteps: number
  totalSteps: number
  /** Índice do 1º passo que falhou, se houver. */
  firstFailure?: number
}

/**
 * Oráculo: o cenário passa quando há ≥1 passo e TODOS tiveram ok=true. Cenário
 * vazio → failed (nada foi confirmado). Determinístico.
 */
export function evaluateScenario(steps: StepResult[]): ScenarioVerdict {
  const totalSteps = steps.length
  const passedSteps = steps.filter((s) => s.ok).length
  const firstFailure = steps.findIndex((s) => !s.ok)
  const verdict: ScenarioVerdict['verdict'] = totalSteps > 0 && passedSteps === totalSteps ? 'passed' : 'failed'
  return {
    verdict,
    passedSteps,
    totalSteps,
    ...(firstFailure >= 0 ? { firstFailure } : {}),
  }
}

export interface ScenarioEvent {
  kind: 'started' | 'step' | 'evidence' | 'passed' | 'failed'
  scenarioId: string
  /** Índice do passo (para kind=step|evidence). */
  stepIndex?: number
  tool?: string
  ok?: boolean
  evidence?: string
}

/**
 * Monta a sequência ordenada de eventos do cenário: started → (step [+evidence])* →
 * passed|failed. Pronta para emitir ao event-store (browser-harness-bridge).
 */
export function buildScenarioEvents(scenarioId: string, steps: StepResult[]): ScenarioEvent[] {
  const events: ScenarioEvent[] = [{ kind: 'started', scenarioId }]
  steps.forEach((s, i) => {
    events.push({ kind: 'step', scenarioId, stepIndex: i, tool: s.tool, ok: s.ok })
    if (s.evidence) events.push({ kind: 'evidence', scenarioId, stepIndex: i, evidence: s.evidence })
  })
  events.push({ kind: evaluateScenario(steps).verdict, scenarioId })
  return events
}
