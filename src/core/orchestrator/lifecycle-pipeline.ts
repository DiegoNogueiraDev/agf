/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * LifecyclePipeline — gerencia pipeline completa de 9 fases.
 * Dado o estado do grafo, decide a proxima acao do ciclo de vida completo.
 * Integra-se com orchestrator.ts para execucao deterministica.
 */
import { getNextPhase, getPrereqs } from '../orchestrator/lifecycle-gate.js'

export type LifecyclePhase =
  'ANALYZE' | 'DESIGN' | 'PLAN' | 'IMPLEMENT' | 'VALIDATE' | 'REVIEW' | 'HANDOFF' | 'DEPLOY' | 'LISTENING'

export type LifecycleAction =
  | 'import_prd'
  | 'analyze_prd'
  | 'design_adrs'
  | 'plan_sprint'
  | 'implement'
  | 'validate'
  | 'review'
  | 'handoff'
  | 'deploy'
  | 'listen'
  | 'done'

export interface LifecycleState {
  currentPhase: string
  hasPrd: boolean
  hasAdrs: boolean
  hasSprintPlan: boolean
  tasksDoneRatio: number
  hasValidated: boolean
  hasReviewed: boolean
}

export interface LifecycleDecision {
  action: LifecycleAction
  phase: string
  reason: string
  gate: string | null
}

const PHASE_ORDER: LifecyclePhase[] = [
  'ANALYZE',
  'DESIGN',
  'PLAN',
  'IMPLEMENT',
  'VALIDATE',
  'REVIEW',
  'HANDOFF',
  'DEPLOY',
  'LISTENING',
]

/** Decide a proxima acao no pipeline completo de lifecycle. */
export function nextLifecycleAction(state: LifecycleState): LifecycleDecision {
  const { currentPhase, hasPrd, hasAdrs, hasSprintPlan, tasksDoneRatio, hasValidated, hasReviewed } = state

  if (!hasPrd) {
    return {
      action: 'import_prd',
      phase: 'ANALYZE',
      reason: 'Sem PRD no grafo. Importar requisitos primeiro.',
      gate: null,
    }
  }

  if (currentPhase === 'ANALYZE' || (!hasAdrs && hasPrd)) {
    const gate = 'prd_quality'
    return {
      action: 'analyze_prd',
      phase: 'ANALYZE',
      reason: 'PRD importado. Validar qualidade e transicionar para DESIGN.',
      gate,
    }
  }

  if (currentPhase === 'DESIGN' || (!hasSprintPlan && hasAdrs)) {
    const gate = 'design_ready'
    return { action: 'design_adrs', phase: 'DESIGN', reason: 'Design pendente. Criar ADRs, definir contratos.', gate }
  }

  if (currentPhase === 'PLAN' || (hasSprintPlan && tasksDoneRatio < 0.5)) {
    const next = getNextPhase('PLAN')
    return {
      action: 'plan_sprint',
      phase: 'PLAN',
      reason: 'Planejar sprint, decompor tasks.',
      gate: next.gate ?? 'sprint_health',
    }
  }

  if (tasksDoneRatio < 0.8) {
    const next = getNextPhase('IMPLEMENT')
    return {
      action: 'implement',
      phase: 'IMPLEMENT',
      reason: `${Math.round(tasksDoneRatio * 100)}% tasks done. Implementar mais.`,
      gate: next.gate ?? 'validate_ready',
    }
  }

  if (!hasValidated && tasksDoneRatio >= 0.8) {
    const next = getNextPhase('VALIDATE')
    return {
      action: 'validate',
      phase: 'VALIDATE',
      reason: 'Tasks suficientes concluidas. Validar integridade.',
      gate: next.gate ?? 'done_integrity',
    }
  }

  if (!hasReviewed && hasValidated) {
    const next = getNextPhase('REVIEW')
    return {
      action: 'review',
      phase: 'REVIEW',
      reason: 'Validacao concluida. Revisar codigo e qualidade.',
      gate: next.gate ?? 'review_ready',
    }
  }

  const next = getNextPhase(currentPhase)
  if (next.next) {
    const prereqs = getPrereqs(currentPhase)
    const actionMap: Record<string, LifecycleAction> = {
      HANDOFF: 'handoff',
      DEPLOY: 'deploy',
      LISTENING: 'listen',
    }
    return {
      action: actionMap[currentPhase] ?? 'done',
      phase: currentPhase,
      reason: `Preparando ${currentPhase} — ${next.gate ? 'gate: ' + next.gate : 'finalizando'}. Prereqs: ${prereqs.join(', ')}`,
      gate: next.gate,
    }
  }

  return { action: 'done', phase: currentPhase, reason: 'Pipeline completa.', gate: null }
}

/** Retorna a ordem das fases para visualizacao. */
export function getPhaseOrder(): LifecyclePhase[] {
  return [...PHASE_ORDER]
}
