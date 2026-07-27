/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Phase detection and anti-pattern warning rules — detectCurrentPhase, detectWarnings.
 * WHY here: rule-evaluation logic separated from gate enforcement (gates.ts) and
 * static mode/guidance lists (modes.ts). Composing: re-exported via lifecycle-phase.ts
 * barrel; imports GUIDANCE from modes.ts and checkToolGate/PHASE_EXEMPT_TOOLS from gates.ts.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { TASK_TYPES, DESIGN_ONLY_TYPES, FEEDBACK_TYPES } from '../utils/node-type-sets.js'
import { createLogger } from '../utils/logger.js'
import type {
  LifecyclePhase,
  PhaseDetectionOptions,
  LifecycleWarning,
  StrictnessMode,
} from './lifecycle-phase-types.js'
import { GUIDANCE } from './lifecycle-phase-modes.js'
import { checkToolGate, PHASE_EXEMPT_TOOLS } from './lifecycle-phase-gates.js'

const _log = createLogger({ layer: 'core', source: 'planner/lifecycle-phase.ts' })

/**
 * Detect the current lifecycle phase from the graph state.
 *
 * Priority order:
 * 1. Manual override (if provided)
 * 2. No nodes → ANALYZE
 * 3. Only design-type nodes → DESIGN
 * 4. Any task in_progress → IMPLEMENT
 * 5. All tasks done + new feedback nodes → LISTENING
 * 6. All tasks done + snapshots exist → HANDOFF
 * 7. All tasks done → REVIEW
 * 8. No sprints assigned → PLAN
 * 9. ≥50% tasks done (threshold for partial completion) → VALIDATE
 * 10. All tasks backlog/ready → PLAN
 * 11. Fallback → IMPLEMENT
 */
export function detectCurrentPhase(doc: GraphDocument, options?: PhaseDetectionOptions): LifecyclePhase {
  if (options?.phaseOverride) {
    return options.phaseOverride
  }

  const { nodes } = doc

  if (nodes.length === 0) {
    return 'ANALYZE'
  }

  const tasks = nodes.filter((n) => TASK_TYPES.has(n.type))
  const hasOnlyDesignNodes = nodes.every((n) => DESIGN_ONLY_TYPES.has(n.type))

  // Check in_progress BEFORE design-only check to handle mixed graphs correctly
  const inProgress = tasks.filter((n) => n.status === 'in_progress')
  if (inProgress.length > 0) {
    return 'IMPLEMENT'
  }

  if (hasOnlyDesignNodes || tasks.length === 0) {
    return 'DESIGN'
  }

  const doneTasks = tasks.filter((n) => n.status === 'done')

  if (doneTasks.length === tasks.length && tasks.length > 0) {
    // All tasks done — check for LISTENING, HANDOFF, or REVIEW
    if (hasNewFeedbackNodes(nodes, doneTasks)) {
      return 'LISTENING'
    }
    if (options?.hasSnapshots) {
      return 'HANDOFF'
    }
    return 'REVIEW'
  }

  const hasSprints = tasks.some((n) => n.sprint != null)

  if (!hasSprints) {
    return 'PLAN'
  }

  // ≥50% done but not all → partial completion phase for validation
  if (doneTasks.length > 0 && doneTasks.length >= tasks.length * 0.5) {
    return 'VALIDATE'
  }

  // Tasks with sprint but not started yet → still PLAN
  const notStarted = tasks.every((n) => n.status === 'backlog' || n.status === 'ready')
  if (notStarted) {
    return 'PLAN'
  }

  return 'IMPLEMENT'
}

/**
 * Check if new feedback/requirement nodes were added after all tasks were completed.
 * This signals the project has entered a feedback loop (LISTENING phase).
 */
function hasNewFeedbackNodes(nodes: GraphDocument['nodes'], doneTasks: GraphDocument['nodes']): boolean {
  const lastDoneTime = doneTasks.reduce((max, n) => {
    const tVar = n.updatedAt ?? n.createdAt
    return tVar > max ? tVar : max
  }, '')

  if (!lastDoneTime) return false

  return nodes.some((n) => FEEDBACK_TYPES.has(n.type) && n.createdAt > lastDoneTime)
}

/**
 * Detect anti-pattern behaviors based on current phase, graph state, and tool being called.
 * In advisory mode: returns warnings (never blocks execution).
 * In strict mode: returns errors that block execution.
 */
export function detectWarnings(
  doc: GraphDocument,
  phase: LifecyclePhase,
  toolName: string,
  mode: StrictnessMode = 'strict',
): LifecycleWarning[] {
  const warnings: LifecycleWarning[] = []
  const guidance = GUIDANCE[phase]

  // Check tool phase restrictions (strict → error, advisory → warning)
  const gateWarnings = checkToolGate(doc, phase, toolName, mode)
  warnings.push(...gateWarnings)

  // Warn if tool is not recommended for current phase (exempt tools skip this)
  if (!PHASE_EXEMPT_TOOLS.has(toolName) && !guidance.suggestedTools.includes(toolName)) {
    warnings.push({
      code: 'tool_not_recommended',
      message: `Tool "${toolName}" não é recomendada para fase ${phase}. Sugeridas: ${guidance.suggestedTools.join(', ')}`,
      severity: 'info',
    })
  }

  // Phase-specific warnings
  if (phase === 'ANALYZE' && toolName === 'update_status') {
    warnings.push({
      code: 'premature_status_change',
      message: 'Fase ANALYZE — defina requisitos antes de implementar. Mudança de status prematura.',
      severity: mode === 'strict' ? 'error' : 'warning',
    })
  }

  if (phase === 'PLAN' && toolName === 'update_status') {
    const tasks = doc.nodes.filter((n) => TASK_TYPES.has(n.type))
    const hasSprints = tasks.some((n) => n.sprint != null)
    if (!hasSprints) {
      warnings.push({
        code: 'no_sprint_assigned',
        message: 'Nenhum sprint atribuído. Atribua sprints antes de iniciar tasks.',
        severity: 'warning',
      })
    }
  }

  if (phase === 'IMPLEMENT' && toolName === 'update_status') {
    const hasAcceptanceCriteria = doc.nodes.some(
      (n) => n.type === 'acceptance_criteria' || (n.acceptanceCriteria && n.acceptanceCriteria.length > 0),
    )
    if (!hasAcceptanceCriteria) {
      warnings.push({
        code: 'no_acceptance_criteria',
        message: 'Nenhum critério de aceitação definido. Considere adicionar antes de concluir tasks.',
        severity: 'warning',
      })
    }
  }

  return warnings
}
