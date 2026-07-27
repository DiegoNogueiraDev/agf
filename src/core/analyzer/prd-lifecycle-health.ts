/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-23.T01 — PRD Lifecycle Health aggregator.
 *
 * Computes a 9-phase pass/fail régua for a single epic. Pure orchestration
 * over existing analyzer/designer/planner/implementer/harness modules — no
 * duplicated logic. Each phase has a single metric with a binary threshold.
 *
 * The agent uses this entry-point to answer the operational question:
 * "did this PRD pass through all 9 lifecycle phases successfully?"
 */

import type { GraphDocument, GraphNode, NodeType } from '../graph/graph-types.js'
import { validateAcQuality } from './ac-validator.js'
import { buildTraceabilityMatrix } from '../designer/traceability-matrix.js'
import { checkDefinitionOfDone } from '../implementer/definition-of-done.js'
import { OperationError } from '../utils/errors.js'

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

export type LifecyclePhase = (typeof LIFECYCLE_PHASES)[number]

export type GradeLetter = 'A' | 'B' | 'C' | 'D'

export interface LifecyclePhaseResult {
  metric: string
  value: number | string
  threshold: number | string
  passed: boolean
  reason?: string
}

export interface LifecycleHealthReport {
  epicId: string
  phases: Record<LifecyclePhase, LifecyclePhaseResult>
  passedCount: number
  passedAll: boolean
  summary: string
}

export interface LifecycleHealthOptions {
  /** Harness grade letter from latest scan, when available. */
  harnessGrade?: GradeLetter
  /** Decision outcome closure rate (0..1) — fraction of decisions
   *  linked to this epic with non-null outcome. Caller computes against
   *  the decisions table. Defaults to 1 when no decisions are linked. */
  decisionOutcomeClosureRate?: number
  /** Capacity calibration ΔPct (|sprintXp − velocityAvg|/velocityAvg). */
  capacityCalibrationDelta?: number
  /** Doc completeness gap count from analyze(doc_completeness). */
  docCompletenessGaps?: number
  /** Blast radius — count of files touched by epic's done tasks. */
  blastRadiusFiles?: number
}

const GRADE_ORDER: Record<GradeLetter, number> = { A: 4, B: 3, C: 2, D: 1 }

function descendantsOf(doc: GraphDocument, rootId: string): GraphNode[] {
  const byParent = new Map<string, GraphNode[]>()
  for (const nVar of doc.nodes) {
    if (nVar.parentId) {
      const arr = byParent.get(nVar.parentId) ?? []
      arr.push(nVar)
      byParent.set(nVar.parentId, arr)
    }
  }
  const out: GraphNode[] = []
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop()
    if (id === undefined) break
    const children = byParent.get(id) ?? []
    for (const cVar of children) {
      out.push(cVar)
      stack.push(cVar.id)
    }
  }
  return out
}

function meanAcQuality(doc: GraphDocument, taskIds: string[]): number {
  if (taskIds.length === 0) return 0
  const scores: number[] = []
  for (const id of taskIds) {
    const report = validateAcQuality(doc, id)
    const node = report.nodes[0]
    if (node) scores.push(node.score)
  }
  if (scores.length === 0) return 0
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

function tddPassRate(descendants: GraphNode[]): number {
  const tasks = descendants.filter((n) => n.type === 'task' || n.type === 'subtask')
  if (tasks.length === 0) return 0
  const done = tasks.filter((t) => t.status === 'done')
  if (done.length === 0) return 0
  // Pass-rate = done tasks with linked test files / total done tasks
  const doneWithTests = done.filter((t) => (t.testFiles ?? []).length > 0)
  return doneWithTests.length / done.length
}

function epicDodGrade(doc: GraphDocument, epicId: string): GradeLetter {
  const report = checkDefinitionOfDone(doc, epicId)
  // checkDefinitionOfDone returns "A"|"B"|"C"|"D"|"F"; map F→D conservatively.
  const gVar = report.grade
  if (gVar === 'A' || gVar === 'B' || gVar === 'C' || gVar === 'D') return gVar
  return 'D'
}

function gradeAtLeast(actual: GradeLetter, threshold: GradeLetter): boolean {
  return GRADE_ORDER[actual] >= GRADE_ORDER[threshold]
}

/** computePrdLifecycleHealth —  */
export function computePrdLifecycleHealth(
  doc: GraphDocument,
  epicId: string,
  options: LifecycleHealthOptions = {},
): LifecycleHealthReport {
  const epic = doc.nodes.find((n) => n.id === epicId)
  if (!epic) {
    throw new OperationError(`Epic node not found: ${epicId}`)
  }
  const descendants = descendantsOf(doc, epicId)
  const taskTypes: NodeType[] = ['task', 'subtask']
  const taskIds = descendants.filter((n) => taskTypes.includes(n.type)).map((n) => n.id)
  const requirementIds = descendants.filter((n) => n.type === 'requirement').map((n) => n.id)

  // ─ ANALYZE: AC quality avg
  const acScore = meanAcQuality(doc, taskIds)
  const analyzeResult: LifecyclePhaseResult = {
    metric: 'ac_quality_score',
    value: acScore,
    threshold: 70,
    passed: acScore >= 70,
    reason: acScore >= 70 ? undefined : `AC quality médio ${acScore} < 70`,
  }

  // ─ DESIGN: traceability coverage of epic's requirements
  const traceability = buildTraceabilityMatrix(doc)
  const linkedReqs = traceability.matrix.filter((e) => requirementIds.includes(e.requirementId))
  const covered = linkedReqs.filter((e) => e.coverage !== 'none').length
  const traceabilityCoverage = linkedReqs.length > 0 ? covered / linkedReqs.length : 1
  const designResult: LifecyclePhaseResult = {
    metric: 'traceability_coverage',
    value: Number(traceabilityCoverage.toFixed(3)),
    threshold: 0.8,
    passed: traceabilityCoverage >= 0.8,
    reason:
      traceabilityCoverage >= 0.8
        ? undefined
        : `${covered}/${linkedReqs.length} requirements têm decision/constraint linkados`,
  }

  // ─ PLAN: capacity calibration ΔPct (caller supplies; default 0 when unknown)
  const capDelta = options.capacityCalibrationDelta ?? 0
  const planResult: LifecyclePhaseResult = {
    metric: 'capacity_calibration_delta_pct',
    value: Number(capDelta.toFixed(3)),
    threshold: 0.1,
    passed: Math.abs(capDelta) <= 0.1,
    reason: Math.abs(capDelta) <= 0.1 ? undefined : `Δ${(capDelta * 100).toFixed(1)}% > 10%`,
  }

  // ─ IMPLEMENT: TDD pass rate (done tasks with test files)
  const tdd = tddPassRate(descendants)
  const implementResult: LifecyclePhaseResult = {
    metric: 'tdd_pass_rate',
    value: Number(tdd.toFixed(3)),
    threshold: 1.0,
    passed: tdd === 1.0,
    reason: tdd === 1.0 ? undefined : `${(tdd * 100).toFixed(0)}% das done tasks têm testFiles linkados`,
  }

  // ─ VALIDATE: DoD grade on epic itself
  const dodGrade = epicDodGrade(doc, epicId)
  const validateResult: LifecyclePhaseResult = {
    metric: 'dod_grade_letter',
    value: dodGrade,
    threshold: 'B',
    passed: gradeAtLeast(dodGrade, 'B'),
    reason: gradeAtLeast(dodGrade, 'B') ? undefined : `DoD grade ${dodGrade} < B`,
  }

  // ─ REVIEW: blast radius (count of unique touched files across done tasks)
  const blast = options.blastRadiusFiles ?? 0
  const reviewResult: LifecyclePhaseResult = {
    metric: 'blast_radius_files',
    value: blast,
    threshold: 5,
    passed: blast <= 5,
    reason: blast <= 5 ? undefined : `${blast} arquivos tocados (>5)`,
  }

  // ─ HANDOFF: doc completeness gaps
  const docGaps = options.docCompletenessGaps ?? 0
  const handoffResult: LifecyclePhaseResult = {
    metric: 'doc_completeness_gaps',
    value: docGaps,
    threshold: 0,
    passed: docGaps === 0,
    reason: docGaps === 0 ? undefined : `${docGaps} doc gaps`,
  }

  // ─ DEPLOY: harness grade letter
  const harnessGrade: GradeLetter = options.harnessGrade ?? 'D'
  const deployResult: LifecyclePhaseResult = {
    metric: 'harness_grade_letter',
    value: harnessGrade,
    threshold: 'B',
    passed: gradeAtLeast(harnessGrade, 'B'),
    reason: gradeAtLeast(harnessGrade, 'B') ? undefined : `Harness grade ${harnessGrade} < B`,
  }

  // ─ LISTENING: decision outcome closure rate (caller supplies from decisions table)
  const closureRate = options.decisionOutcomeClosureRate ?? 1
  const listeningResult: LifecyclePhaseResult = {
    metric: 'decision_outcome_closure_rate',
    value: Number(closureRate.toFixed(3)),
    threshold: 1.0,
    passed: closureRate === 1.0,
    reason: closureRate === 1.0 ? undefined : `${(closureRate * 100).toFixed(0)}% das decisões têm outcome registrado`,
  }

  const phases = {
    ANALYZE: analyzeResult,
    DESIGN: designResult,
    PLAN: planResult,
    IMPLEMENT: implementResult,
    VALIDATE: validateResult,
    REVIEW: reviewResult,
    HANDOFF: handoffResult,
    DEPLOY: deployResult,
    LISTENING: listeningResult,
  } as const

  const passedCount = Object.values(phases).filter((p) => p.passed).length
  const passedAll = passedCount === LIFECYCLE_PHASES.length
  const failed = (Object.entries(phases) as [LifecyclePhase, LifecyclePhaseResult][])
    .filter(([, r]) => !r.passed)
    .map(([k]) => k)

  const summary = passedAll
    ? `Self-hosting: 9/9 fases passaram (epic ${epic.title})`
    : `${passedCount}/9 fases passaram. Falhando: ${failed.join(', ')}`

  return { epicId, phases, passedCount, passedAll, summary }
}
