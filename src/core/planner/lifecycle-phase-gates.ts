/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Phase gate enforcement — validatePhaseTransition, checkToolGate, checkStatusGate,
 * checkPrerequisiteGate, PHASE_PREREQUISITES.
 * WHY here: gate and prerequisite enforcement grouped as the strictness-enforcement
 * boundary — all decisions about "is this allowed?" live in one place.
 * Composing: re-exported via lifecycle-phase.ts barrel; PHASE_EXEMPT_TOOLS is
 * imported by lifecycle-phase-rules.ts for detectWarnings.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { BOOTSTRAP_TOOLS } from '../utils/constants.js'
import { nodeHasAc } from '../utils/ac-helpers.js'
import { parseAc } from '../analyzer/ac-parser.js'
import { checkDesignReadiness } from '../designer/definition-of-ready.js'
import { checkDefinitionOfDone } from '../implementer/definition-of-done.js'
import { checkValidationReadiness } from '../validator/definition-of-ready.js'
import { checkReviewReadiness } from '../reviewer/review-readiness.js'
import { checkHandoffReadiness } from '../handoff/delivery-checklist.js'
import { checkDeployReadiness } from '../deployer/deploy-readiness.js'
import { checkListeningReadiness } from '../listener/feedback-readiness.js'
import { TASK_TYPES } from '../utils/node-type-sets.js'
import type { LifecyclePhase, LifecycleWarning, StrictnessMode } from './lifecycle-phase-types.js'

// ── Phase Gates ────────────────────────────────

export interface PhaseGateResult {
  allowed: boolean
  reason: string | null
  unmetConditions: string[]
}

type PhaseGateCheck = (doc: GraphDocument) => PhaseGateResult

const PHASE_GATES: Partial<Record<`${LifecyclePhase}_to_${LifecyclePhase}`, PhaseGateCheck>> = {
  ANALYZE_to_DESIGN: (doc) => {
    const hasEpicOrRequirement = doc.nodes.some((n) => n.type === 'epic' || n.type === 'requirement')
    return {
      allowed: hasEpicOrRequirement,
      reason: hasEpicOrRequirement ? null : 'Nenhum epic ou requirement encontrado',
      unmetConditions: hasEpicOrRequirement ? [] : ["Criar pelo menos 1 node tipo 'epic' ou 'requirement'"],
    }
  },
  DESIGN_to_PLAN: (doc) => {
    const report = checkDesignReadiness(doc)
    return {
      allowed: report.ready,
      reason: report.ready ? null : report.summary,
      unmetConditions: report.checks.filter((c) => c.severity === 'required' && !c.passed).map((c) => c.details),
    }
  },
  PLAN_to_IMPLEMENT: (doc) => {
    const tasks = doc.nodes.filter((n) => TASK_TYPES.has(n.type))
    const hasSprints = tasks.some((n) => n.sprint != null)
    return {
      allowed: hasSprints,
      reason: hasSprints ? null : 'Nenhuma task com sprint atribuído',
      unmetConditions: hasSprints ? [] : ['Atribuir sprint a pelo menos 1 task'],
    }
  },
  IMPLEMENT_to_VALIDATE: (doc) => {
    const report = checkValidationReadiness(doc)

    // Additional recommended check: ≥50% done tasks have testable AC
    const tasks = doc.nodes.filter((n) => TASK_TYPES.has(n.type))
    const doneTasks = tasks.filter((n) => n.status === 'done')
    const doneWithTestableAc = doneTasks.filter((n) => {
      const acs = n.acceptanceCriteria ?? []
      return acs.some((ac) => parseAc(ac).isTestable)
    })
    const testableRatio = doneTasks.length > 0 ? doneWithTestableAc.length / doneTasks.length : 0

    const conditions = report.checks.filter((c) => c.severity === 'required' && !c.passed).map((c) => c.details)

    // Testable AC is recommended (warning), not required
    if (testableRatio < 0.5 && doneTasks.length > 0) {
      conditions.push(`Recomendado: ≥50% das done tasks com AC testável (atual: ${Math.round(testableRatio * 100)}%)`)
    }

    return {
      allowed: report.ready,
      reason: report.ready ? null : report.summary,
      unmetConditions: conditions,
    }
  },
  VALIDATE_to_REVIEW: (doc) => {
    const report = checkReviewReadiness(doc)
    return {
      allowed: report.ready,
      reason: report.ready ? null : report.summary,
      unmetConditions: report.checks.filter((c) => c.severity === 'required' && !c.passed).map((c) => c.details),
    }
  },
  REVIEW_to_HANDOFF: (doc) => {
    const report = checkHandoffReadiness(doc)
    return {
      allowed: report.ready,
      reason: report.ready ? null : report.summary,
      unmetConditions: report.checks.filter((c) => c.severity === 'required' && !c.passed).map((c) => c.details),
    }
  },
  HANDOFF_to_DEPLOY: (doc) => {
    const report = checkDeployReadiness(doc)
    return {
      allowed: report.ready,
      reason: report.ready ? null : report.summary,
      unmetConditions: report.checks.filter((c) => c.severity === 'required' && !c.passed).map((c) => c.details),
    }
  },
  HANDOFF_to_LISTENING: (doc) => {
    const report = checkListeningReadiness(doc)
    return {
      allowed: report.ready,
      reason: report.ready ? null : report.summary,
      unmetConditions: report.checks.filter((c) => c.severity === 'required' && !c.passed).map((c) => c.details),
    }
  },
  DEPLOY_to_LISTENING: (doc) => {
    const report = checkListeningReadiness(doc)
    return {
      allowed: report.ready,
      reason: report.ready ? null : report.summary,
      unmetConditions: report.checks.filter((c) => c.severity === 'required' && !c.passed).map((c) => c.details),
    }
  },
}

/**
 * Validate whether a phase transition is allowed based on graph state.
 */
export function validatePhaseTransition(
  doc: GraphDocument,
  fromPhase: LifecyclePhase,
  toPhase: LifecyclePhase,
): PhaseGateResult {
  const key = `${fromPhase}_to_${toPhase}` as `${LifecyclePhase}_to_${LifecyclePhase}`
  const gate = PHASE_GATES[key]

  if (!gate) {
    // No gate defined for this transition — allowed by default
    return { allowed: true, reason: null, unmetConditions: [] }
  }

  return gate(doc)
}

// ── Tool Phase Restrictions ────────────────────

const PHASE_RECOMMENDED_TOOLS: Record<LifecyclePhase, Set<string>> = {
  ANALYZE: new Set(['import_prd', 'node', 'edge', 'search', 'analyze']),
  DESIGN: new Set(['node', 'edge', 'analyze', 'write_memory', 'read_memory']),
  PLAN: new Set(['plan_sprint', 'analyze', 'sync_stack_docs', 'decompose', 'node', 'edge']),
  IMPLEMENT: new Set([
    'next',
    'context',
    'update_status',
    'node',
    'analyze',
    'write_memory',
    'validate',
    'validate_task',
    'edge',
  ]),
  VALIDATE: new Set(['validate', 'analyze', 'update_status', 'validate_task']),
  REVIEW: new Set(['analyze', 'export', 'metrics', 'validate', 'validate_task']),
  HANDOFF: new Set(['export', 'snapshot', 'write_memory', 'validate', 'validate_task']),
  DEPLOY: new Set(['export', 'snapshot', 'analyze', 'metrics', 'write_memory']),
  LISTENING: new Set(['import_prd', 'node', 'analyze', 'manage_skill', 'validate_task']),
}

/** Tools exempt from phase gating — includes bootstrap tools + read-only operations. */
export const PHASE_EXEMPT_TOOLS = new Set([
  ...BOOTSTRAP_TOOLS,
  'list',
  'show',
  'search',
  'metrics',
  'export',
  'snapshot',
  'context',
  'knowledge',
  'next',
  'analyze',
  'read_memory',
  'list_memories',
  'list_skills',
  'update_node', // deprecated wrapper for node(action:update) — exempt from phase warnings
])

/**
 * Check if a tool is allowed in the current phase.
 * Returns warnings with severity based on strictness mode.
 */
/** Check if a tool is allowed in the current phase. */
export function checkToolGate(
  doc: GraphDocument,
  phase: LifecyclePhase,
  toolName: string,
  mode: StrictnessMode = 'strict',
): LifecycleWarning[] {
  if (PHASE_EXEMPT_TOOLS.has(toolName)) {
    return []
  }

  const recommended = PHASE_RECOMMENDED_TOOLS[phase]
  if (recommended?.has(toolName)) {
    return []
  }

  // If the tool isn't known to any phase's recommended list, it's an unknown/external tool — allow it
  const isKnownTool = Object.values(PHASE_RECOMMENDED_TOOLS).some((s) => s.has(toolName))
  if (!isKnownTool) {
    return []
  }

  const severity = mode === 'strict' ? 'error' : 'warning'
  return [
    {
      code: 'tool_phase_blocked',
      message: `Tool "${toolName}" não é recomendada na fase ${phase}. Avance para a fase apropriada primeiro.`,
      severity,
    },
  ]
}

// ── Status Gate ────────────────────────────────

export interface StatusGateResult {
  warnings: LifecycleWarning[]
}

/**
 * Check if a status transition is allowed for a specific node in the current phase.
 */
export function checkStatusGate(
  doc: GraphDocument,
  phase: LifecyclePhase,
  nodeId: string,
  newStatus: string,
  mode: StrictnessMode = 'strict',
): StatusGateResult {
  const warnings: LifecycleWarning[] = []
  const severity = mode === 'strict' ? 'error' : 'warning'

  const node = doc.nodes.find((n) => n.id === nodeId)

  if (newStatus === 'done' && phase === 'IMPLEMENT') {
    // Check if node or parent has acceptance criteria (inline or child AC nodes)
    const hasAC = nodeHasAc(doc, nodeId)
    const parentId = node?.parentId
    const parentHasAC = parentId ? nodeHasAc(doc, parentId) : false
    const globalAC = doc.nodes.some((n) => n.type === 'acceptance_criteria')

    if (!hasAC && !parentHasAC && !globalAC) {
      warnings.push({
        code: 'done_without_acceptance_criteria',
        message: `Node "${nodeId}" marcado como done sem acceptance criteria definidos.`,
        severity,
      })
    }

    // DoD pre-check — lightweight Definition of Done validation
    // Only fire for nodes that have AC (the no-AC case is already handled above)
    if (hasAC || parentHasAC || globalAC) {
      const dodReport = checkDefinitionOfDone(doc, nodeId)
      if (!dodReport.ready) {
        const failedRequired = dodReport.checks.filter((c) => c.severity === 'required' && !c.passed).map((c) => c.name)
        warnings.push({
          code: 'done_without_dod',
          message: `Node "${nodeId}" não atende Definition of Done: ${failedRequired.join(', ')} (score: ${dodReport.score}, grade: ${dodReport.grade}).`,
          severity: 'warning', // Always warning — DoD is informational guidance
        })
      }
    }
  }

  if (newStatus === 'in_progress' && phase === 'PLAN') {
    const tasks = doc.nodes.filter((n) => TASK_TYPES.has(n.type))
    const taskNode = tasks.find((n) => n.id === nodeId)
    if (taskNode && !taskNode.sprint) {
      warnings.push({
        code: 'in_progress_without_sprint',
        message: `Task "${nodeId}" iniciada sem sprint atribuído.`,
        severity,
      })
    }
  }

  if (newStatus === 'done' && node && node.status !== 'in_progress') {
    warnings.push({
      code: 'done_without_in_progress',
      message: `Node "${nodeId}" marcado como done sem ter passado por in_progress (status atual: ${node.status}).`,
      severity: 'warning', // Always warning, even in strict — this is a soft guideline
    })
  }

  return { warnings }
}

// ── Tool Prerequisite Enforcement ────────────────

export type PrerequisiteScope = 'node' | 'project'

export interface PrerequisiteRequiredTool {
  tool: string
  /** Alternative tool names that also satisfy this prerequisite (e.g., rag_context for context). */
  aliases?: string[]
  args?: string
  scope: PrerequisiteScope
}

export interface PrerequisiteRule {
  triggerTool: string
  triggerCondition?: (args: Record<string, unknown>) => boolean
  requiredTools: PrerequisiteRequiredTool[]
  description: string
}

/** Prerequisite rules keyed by lifecycle phase. */
export const PHASE_PREREQUISITES: Record<LifecyclePhase, PrerequisiteRule[]> = {
  ANALYZE: [],
  DESIGN: [
    {
      triggerTool: 'set_phase',
      triggerCondition: (args) => args.phase === 'PLAN',
      requiredTools: [{ tool: 'analyze', args: 'design_ready', scope: 'project' }],
      description: 'Antes de DESIGN→PLAN: chamar `analyze(design_ready)`',
    },
  ],
  PLAN: [
    {
      triggerTool: 'set_phase',
      triggerCondition: (args) => args.phase === 'IMPLEMENT',
      requiredTools: [
        { tool: 'sync_stack_docs', scope: 'project' },
        { tool: 'plan_sprint', scope: 'project' },
      ],
      description: 'Antes de PLAN→IMPLEMENT: chamar `sync_stack_docs` + `plan_sprint`',
    },
  ],
  IMPLEMENT: [
    {
      triggerTool: 'update_status',
      triggerCondition: (args) => args.status === 'in_progress',
      requiredTools: [{ tool: 'next', scope: 'project' }],
      description: 'Antes de in_progress: chamar `next` para carregar contexto da task',
    },
    {
      triggerTool: 'update_status',
      triggerCondition: (args) => args.status === 'done',
      requiredTools: [
        { tool: 'context', scope: 'node' },
        { tool: 'context', aliases: ['rag_context'], scope: 'project' },
        { tool: 'analyze', args: 'implement_done', scope: 'node' },
      ],
      description: 'Antes de done: chamar `context` + `rag_context` + `analyze(implement_done)`',
    },
  ],
  VALIDATE: [
    {
      triggerTool: 'update_status',
      triggerCondition: (args) => args.status === 'done',
      requiredTools: [
        { tool: 'validate', scope: 'node' },
        { tool: 'analyze', args: 'validate_ready', scope: 'project' },
      ],
      description: 'Antes de done em VALIDATE: chamar `validate(ac)` + `analyze(validate_ready)`',
    },
  ],
  REVIEW: [
    {
      triggerTool: 'set_phase',
      triggerCondition: (args) => args.phase === 'HANDOFF',
      requiredTools: [
        { tool: 'analyze', args: 'review_ready', scope: 'project' },
        { tool: 'export', scope: 'project' },
      ],
      description: 'Antes de REVIEW→HANDOFF: chamar `analyze(review_ready)` + `export`',
    },
  ],
  HANDOFF: [
    {
      triggerTool: 'set_phase',
      triggerCondition: (args) => args.phase === 'DEPLOY',
      requiredTools: [
        { tool: 'analyze', args: 'deploy_ready', scope: 'project' },
        { tool: 'snapshot', scope: 'project' },
        { tool: 'write_memory', scope: 'project' },
      ],
      description: 'Antes de HANDOFF→DEPLOY: chamar `analyze(deploy_ready)` + `snapshot` + `write_memory`',
    },
    {
      triggerTool: 'set_phase',
      triggerCondition: (args) => args.phase === 'LISTENING',
      requiredTools: [
        { tool: 'analyze', args: 'handoff_ready', scope: 'project' },
        { tool: 'snapshot', scope: 'project' },
        { tool: 'write_memory', scope: 'project' },
      ],
      description: 'Antes de HANDOFF→LISTENING: chamar `analyze(handoff_ready)` + `snapshot` + `write_memory`',
    },
  ],
  DEPLOY: [
    {
      triggerTool: 'set_phase',
      triggerCondition: (args) => args.phase === 'LISTENING',
      requiredTools: [
        { tool: 'analyze', args: 'deploy_ready', scope: 'project' },
        { tool: 'snapshot', scope: 'project' },
      ],
      description: 'Antes de DEPLOY→LISTENING: chamar `analyze(deploy_ready)` + `snapshot`',
    },
  ],
  LISTENING: [],
}

/**
 * Check if mandatory prerequisite tools have been called before allowing the current tool.
 * Returns warnings with severity based on strictness mode.
 */
export function checkPrerequisiteGate(
  phase: LifecyclePhase,
  toolName: string,
  toolArgs: Record<string, unknown>,
  nodeId: string | undefined,
  hasBeenCalled: (nodeId: string | null, tool: string, args?: string) => boolean,
  mode: StrictnessMode,
): LifecycleWarning[] {
  const rules = PHASE_PREREQUISITES[phase]
  if (!rules || rules.length === 0) return []

  const warnings: LifecycleWarning[] = []
  const severity = mode === 'strict' ? 'error' : 'warning'

  for (const rule of rules) {
    if (rule.triggerTool !== toolName) continue
    if (rule.triggerCondition && !rule.triggerCondition(toolArgs)) continue

    for (const req of rule.requiredTools) {
      const lookupNodeId = req.scope === 'node' ? (nodeId ?? null) : null
      let called = hasBeenCalled(lookupNodeId, req.tool, req.args)

      // Check aliases (e.g., rag_context satisfies context requirement)
      if (!called && req.aliases) {
        for (const alias of req.aliases) {
          if (hasBeenCalled(lookupNodeId, alias, req.args)) {
            called = true
            break
          }
        }
      }

      if (!called) {
        const scopeHint = req.scope === 'node' && nodeId ? ` para node "${nodeId}"` : ''
        const argsHint = req.args ? `(${req.args})` : ''
        warnings.push({
          code: 'prerequisite_missing',
          message: `Pré-requisito não atendido: chamar \`${req.tool}${argsHint}\`${scopeHint} antes de \`${toolName}\`. ${rule.description}`,
          severity,
        })
      }
    }
  }

  return warnings
}
