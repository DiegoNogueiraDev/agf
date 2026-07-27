/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Sprint Progress — burndown, velocity trend, blockers, critical path, and ETA.
 * Composes existing functions: calculateVelocity + findCriticalPath + findTransitiveBlockers.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { SprintProgressReport, VelocityTrendDirection } from '../../schemas/implementer-schema.js'
import { calculateVelocity } from '../planner/velocity.js'
import { findTransitiveBlockers, findCriticalPath } from '../planner/dependency-chain.js'
import { TASK_TYPES } from '../utils/node-type-sets.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'sprint-progress.ts' })

/**
 * Calculate sprint progress with burndown, velocity, blockers, and ETA.
 */
export function calculateSprintProgress(doc: GraphDocument, sprint?: string): SprintProgressReport {
  // Filter tasks by sprint if provided
  const allTasks = doc.nodes.filter((n) => TASK_TYPES.has(n.type))
  const tasks = sprint ? allTasks.filter((n) => n.sprint === sprint) : allTasks

  const done = tasks.filter((n) => n.status === 'done').length
  const inProgress = tasks.filter((n) => n.status === 'in_progress').length
  const blocked = tasks.filter((n) => n.status === 'blocked').length
  const backlog = tasks.filter((n) => n.status === 'backlog').length
  const ready = tasks.filter((n) => n.status === 'ready').length
  const total = tasks.length
  const donePercent = total > 0 ? Math.round((done / total) * 100) : 0

  // Velocity trend
  const velocity = calculateVelocity(doc)
  const currentSprintVelocity = sprint
    ? (velocity.sprints.find((s) => s.sprint === sprint)?.totalPoints ?? 0)
    : velocity.overall.totalPoints
  const averageVelocity = velocity.overall.avgPointsPerSprint
  const trend = determineTrend(currentSprintVelocity, averageVelocity)

  // Blockers
  const blockedTasks = tasks.filter((n) => n.status === 'blocked')
  const blockers = blockedTasks.map((t) => {
    const transBlockers = findTransitiveBlockers(doc, t.id)
    return {
      nodeId: t.id,
      title: t.title,
      blockedBy: transBlockers.map((b) => b.id),
    }
  })

  // Critical path remaining (Bug #073: include total for context)
  const criticalPath = findCriticalPath(doc)
  const criticalPathTotal = criticalPath.length
  const criticalPathRemaining = criticalPath.filter((n) => n.status !== 'done').length

  // ETA
  const remaining = total - done
  const avgHours = velocity.overall.avgCompletionHours
  const estimatedCompletionDays =
    remaining > 0 && avgHours !== null && avgHours > 0
      ? Math.round(((remaining * avgHours) / 8) * 10) / 10 // 8h per day
      : null

  const summary = `Sprint Progress: ${done}/${total} done (${donePercent}%). ${blocked} blocked, ${criticalPathRemaining} on critical path.${estimatedCompletionDays !== null ? ` ETA: ~${estimatedCompletionDays} days.` : ''}`

  log.info('sprint-progress', {
    sprint: sprint ?? '(all)',
    done,
    total,
    donePercent,
    blocked,
    criticalPathRemaining,
  })

  return {
    sprint: sprint ?? null,
    burndown: { total, done, inProgress, blocked, backlog, ready, donePercent },
    velocityTrend: { currentSprintVelocity, averageVelocity, trend },
    blockers,
    criticalPathTotal,
    criticalPathRemaining,
    estimatedCompletionDays,
    summary,
  }
}

function determineTrend(current: number, average: number): VelocityTrendDirection {
  if (average === 0) return 'stable'
  const ratio = current / average
  if (ratio > 1.1) return 'up'
  if (ratio < 0.9) return 'down'
  return 'stable'
}
