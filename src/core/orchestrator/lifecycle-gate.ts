/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * LifecycleGate — gerencia transicoes entre fases do lifecycle.
 * Mapeia 8 transicoes e seus gates.
 * Movido de src/tui/lifecycle-gate.ts para src/core/ para respeitar layer boundary.
 */

export const LIFECYCLE_PHASES = [
  'ANALYZE',
  'DESIGN',
  'PLAN',
  'IMPLEMENT',
  'VALIDATE',
  'REVIEW',
  'HANDOFF',
  'DEPLOY',
  'LISTENING',
] as const

const LIFECYCLE_GATES: Record<string, { next: string; gate: string; prereqs: string[] }> = {
  ANALYZE: { next: 'DESIGN', gate: 'prd_quality', prereqs: ['has_requirements'] },
  DESIGN: { next: 'PLAN', gate: 'design_ready', prereqs: ['has_adrs', 'has_contracts'] },
  PLAN: { next: 'IMPLEMENT', gate: 'sprint_health', prereqs: ['has_decomposition', 'has_dependencies'] },
  IMPLEMENT: { next: 'VALIDATE', gate: 'validate_ready', prereqs: ['tasks_done_pct'] },
  VALIDATE: { next: 'REVIEW', gate: 'done_integrity', prereqs: ['scenario_coverage'] },
  REVIEW: { next: 'HANDOFF', gate: 'review_ready', prereqs: ['blast_radius'] },
  HANDOFF: { next: 'DEPLOY', gate: 'handoff_ready', prereqs: ['doc_completeness'] },
  DEPLOY: { next: 'LISTENING', gate: 'deploy_ready', prereqs: ['release_check'] },
}

export interface GateResult {
  passed: boolean
  gate: string
  phase: string
  missingPrereqs: string[]
}

/** Retorna o proximo passo no lifecycle com gate. */
export function getNextPhase(current: string): { next: string | null; gate: string | null } {
  const entry = LIFECYCLE_GATES[current]
  if (!entry) {
    if (current === 'SHAPE') return { next: 'DESIGN', gate: 'prd_quality' }
    if (current === 'BUILD') return { next: 'VALIDATE', gate: 'validate_ready' }
    if (current === 'SHIP') return { next: 'LISTENING', gate: null }
    return { next: null, gate: null }
  }
  return { next: entry.next, gate: entry.gate }
}

/** Lista prerequisitos para a fase atual. */
export function getPrereqs(phase: string): string[] {
  return LIFECYCLE_GATES[phase]?.prereqs ?? []
}
