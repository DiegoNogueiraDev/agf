/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Sprint Health — analyzes the health of a sprint based on task metrics.
 * Returns a health grade (healthy/at_risk/critical) with detailed metrics and warnings.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import { XP_SIZE_POINTS } from '../utils/xp-sizing.js'
import { runHarnessScanCached } from '../harness/harness-cache.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'sprint-health.ts' })

export interface SprintHealthReport {
  sprint: string | null
  health: 'healthy' | 'at_risk' | 'critical'
  metrics: {
    totalPoints: number
    taskCount: number
    doneCount: number
    blockedCount: number
    burndownRatio: number
    blockedRatio: number
    tasksWithoutAC: number
    externalDeps: number
    structuralCount: number
  }
  warnings: string[]
}

/** Analyze sprint health and return grade with warnings. */
export function analyzeSprintHealth(doc: GraphDocument, sprintFilter?: string): SprintHealthReport {
  const allTaskNodes = doc.nodes.filter(
    (n) => (n.type === 'task' || n.type === 'subtask') && (sprintFilter ? n.sprint === sprintFilter : true),
  )
  // §EPIC-23.SprintA — split structural (PRD scaffolding) from implementable.
  const structuralCount = allTaskNodes.filter((n) => n.metadata?.implementable === false).length
  const tasks = allTaskNodes.filter((n) => n.metadata?.implementable !== false)

  const totalPoints = tasks.reduce((sum, t) => sum + (XP_SIZE_POINTS[t.xpSize ?? 'M'] ?? 3), 0)
  const doneCount = tasks.filter((t) => t.status === 'done').length
  const blockedCount = tasks.filter((t) => t.status === 'blocked' || t.blocked).length

  // BUG-03: a task may declare its AC inline (`acceptanceCriteria` array) OR
  // as child nodes of type `acceptance_criteria`. Count both — otherwise tasks
  // that were decomposed into structured AC nodes are wrongly flagged.
  const taskHasAC = new Set<string>()
  for (const tVar of tasks) {
    if (tVar.acceptanceCriteria && tVar.acceptanceCriteria.length > 0) {
      taskHasAC.add(tVar.id)
    }
  }
  for (const nVar of doc.nodes) {
    if (nVar.type === 'acceptance_criteria' && nVar.parentId && !taskHasAC.has(nVar.parentId)) {
      taskHasAC.add(nVar.parentId)
    }
  }
  const tasksWithoutAC = tasks.filter((t) => !taskHasAC.has(t.id)).length

  // External deps: tasks in this sprint that depend on tasks in OTHER sprints
  const sprintTaskIds = new Set(tasks.map((t) => t.id))
  const externalDeps = doc.edges.filter(
    (e) => e.relationType === 'depends_on' && sprintTaskIds.has(e.from) && !sprintTaskIds.has(e.to),
  ).length

  const burndownRatio = tasks.length > 0 ? doneCount / tasks.length : 1
  const blockedRatio = tasks.length > 0 ? blockedCount / tasks.length : 0

  const warnings: string[] = []
  if (blockedRatio > 0.3) warnings.push(`${blockedCount} tasks blocked (${Math.round(blockedRatio * 100)}%)`)
  if (tasksWithoutAC > 0) warnings.push(`${tasksWithoutAC} tasks without acceptance criteria`)
  if (externalDeps > 0) warnings.push(`${externalDeps} external dependencies`)

  let health: 'healthy' | 'at_risk' | 'critical' = 'healthy'
  if (blockedRatio > 0.3 || burndownRatio < 0.2) health = 'critical'
  else if (blockedRatio > 0.1 || tasksWithoutAC > tasks.length * 0.3) health = 'at_risk'

  log.info('sprint-health', { sprint: sprintFilter ?? 'all', health, tasks: tasks.length })

  // Harness delta (non-blocking)
  let harnessDelta: { current: number; grade: string } | null = null
  try {
    const harness = runHarnessScanCached(process.cwd())
    if (harness) {
      harnessDelta = { current: harness.score, grade: harness.grade }
      if (harness.regression) {
        warnings.push(`Harness score regrediu ${harness.regressionDelta ?? 0} pontos durante o sprint`)
        if (health === 'healthy') health = 'at_risk'
      }
    }
  } catch (err) {
    log.debug('intentional-swallow', { error: String(err), reason: 'non-blocking harness check' })
  }

  return {
    sprint: sprintFilter ?? null,
    health,
    metrics: {
      totalPoints,
      taskCount: tasks.length,
      doneCount,
      blockedCount,
      burndownRatio,
      blockedRatio,
      tasksWithoutAC,
      externalDeps,
      structuralCount,
    },
    warnings,
    ...(harnessDelta ? { harnessDelta } : {}),
  }
}
