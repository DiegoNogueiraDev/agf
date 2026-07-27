/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Scope Analyzer — detects orphans, coverage gaps, and conflicts in the graph.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { ScopeAnalysis, OrphanNode, CoverageMatrix } from '../../schemas/analyzer-schema.js'
import { detectCycles } from '../planner/dependency-chain.js'
import { TASK_TYPES, REQUIREMENT_TYPES } from '../utils/node-type-sets.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'scope-analyzer.ts' })

/** analyzeScope —  */
export function analyzeScope(doc: GraphDocument): ScopeAnalysis {
  const { nodes, edges } = doc
  const orphans: OrphanNode[] = []

  // ── Orphan detection ──

  // Requirements without tasks linked
  const reqNodes = nodes.filter((n) => REQUIREMENT_TYPES.has(n.type))
  const tasks = nodes.filter((n) => TASK_TYPES.has(n.type))

  const parentIds = new Set(tasks.map((t) => t.parentId).filter(Boolean))
  const edgeTargetIds = new Set(edges.map((e) => e.to))
  const edgeSourceIds = new Set(edges.map((e) => e.from))

  for (const req of reqNodes) {
    const hasChildTask = parentIds.has(req.id)
    const hasEdgeToTask = edgeSourceIds.has(req.id) || edgeTargetIds.has(req.id)
    if (!hasChildTask && !hasEdgeToTask) {
      orphans.push({
        id: req.id,
        title: req.title,
        type: req.type,
        reason: 'Requirement sem tasks vinculadas',
      })
    }
  }

  // Tasks without parent or edges
  for (const task of tasks) {
    const hasParent = task.parentId != null
    const hasEdges = edgeSourceIds.has(task.id) || edgeTargetIds.has(task.id)
    if (!hasParent && !hasEdges) {
      orphans.push({
        id: task.id,
        title: task.title,
        type: task.type,
        reason: 'Task sem parent ou relações',
      })
    }
  }

  // ── Cycles ──
  const cycles = detectCycles(doc)

  // ── Coverage matrix ──
  // Bug #009/#030: only count explicit links between requirements and tasks
  const taskIds = new Set(tasks.map((t) => t.id))
  const reqsWithTasks = reqNodes.filter((r) => {
    const hasChildTask = tasks.some((t) => t.parentId === r.id)
    const hasExplicitEdgeToTask = edges.some(
      (e) =>
        (e.relationType === 'depends_on' || e.relationType === 'related_to' || e.relationType === 'blocks') &&
        ((e.from === r.id && taskIds.has(e.to)) || (e.to === r.id && taskIds.has(e.from))),
    )
    return hasChildTask || hasExplicitEdgeToTask
  })

  const tasksWithAc = tasks.filter(
    (t) =>
      (t.acceptanceCriteria && t.acceptanceCriteria.length > 0) ||
      nodes.some((n) => n.type === 'acceptance_criteria' && n.parentId === t.id),
  )

  // §BUG-06-A — Field renamed: orphanRequirements → orphanRequirementsCount
  // (number of requirement-type orphans). traceabilityWarning counts
  // requirements without decision/constraint edges.
  const orphanRequirementsCount = orphans.filter((o) => REQUIREMENT_TYPES.has(o.type)).length
  const decisionConstraintEdgeFroms = new Set(
    edges
      .filter((e) => {
        const tgt = nodes.find((n) => n.id === e.to)
        return tgt && (tgt.type === 'decision' || tgt.type === 'constraint')
      })
      .map((e) => e.from),
  )
  const traceabilityWarning = reqNodes.filter((r) => !decisionConstraintEdgeFroms.has(r.id)).length

  const coverage: CoverageMatrix = {
    requirementsToTasks: reqNodes.length > 0 ? Math.round((reqsWithTasks.length / reqNodes.length) * 100) : 100,
    tasksToAc: tasks.length > 0 ? Math.round((tasksWithAc.length / tasks.length) * 100) : 100,
    orphanRequirementsCount,
    orphanTasks: orphans.filter((o) => TASK_TYPES.has(o.type)).length,
    traceabilityWarning,
  }

  // ── Conflicts (simple keyword contradiction detection) ──
  const conflicts: string[] = []
  const constraintNodes = nodes.filter((n) => n.type === 'constraint')
  const constraintTexts = constraintNodes.map((n) => ({
    id: n.id,
    text: `${n.title} ${n.description ?? ''}`.toLowerCase(),
  }))

  const contradictions = [
    ['performance', 'funcionalidade'],
    ['velocidade', 'segurança'],
    ['simples', 'completo'],
    ['rápido', 'robusto'],
  ]

  for (let i = 0; i < constraintTexts.length; i++) {
    for (let j = i + 1; j < constraintTexts.length; j++) {
      for (const [a, b] of contradictions) {
        if (
          (constraintTexts[i].text.includes(a) && constraintTexts[j].text.includes(b)) ||
          (constraintTexts[i].text.includes(b) && constraintTexts[j].text.includes(a))
        ) {
          conflicts.push(
            `Possível conflito entre "${constraintTexts[i].id}" (${a}) e "${constraintTexts[j].id}" (${b})`,
          )
        }
      }
    }
  }

  const summaryParts: string[] = []
  if (orphans.length > 0) summaryParts.push(`${orphans.length} órfãos`)
  if (cycles.length > 0) summaryParts.push(`${cycles.length} ciclos`)
  if (conflicts.length > 0) summaryParts.push(`${conflicts.length} conflitos`)
  const summary =
    summaryParts.length > 0
      ? `Scope issues: ${summaryParts.join(', ')}`
      : 'Escopo limpo — sem órfãos, ciclos ou conflitos detectados'

  log.info('scope-analyzer', { orphans: orphans.length, cycles: cycles.length, conflicts: conflicts.length })

  return { orphans, cycles, coverage, conflicts, summary, orphanRequirementsCount }
}
