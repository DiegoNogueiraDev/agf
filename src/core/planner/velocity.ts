/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Velocity tracking: measures sprint completion metrics.
 *
 * Computes:
 * - Tasks completed per sprint
 * - Average XP size completed
 * - Estimated completion time (based on created→done timestamps)
 */

import { z } from 'zod/v4'
import type { GraphDocument, GraphNode } from '../graph/graph-types.js'
import { XP_SIZE_POINTS } from '../utils/xp-sizing.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'velocity.ts' })

const VelocityFilterSchema = z.object({
  sprintId: z.string().optional(),
  limit: z.number().optional(),
})

/** Velocity metrics for a single sprint — tasks completed, points, and timing. */
export interface SprintVelocity {
  sprint: string
  tasksCompleted: number
  totalPoints: number
  avgPointsPerTask: number
  avgCompletionHours: number | null
  tasks: VelocityTask[]
}

/** Velocity entry for a single completed task with XP points and timing. */
export interface VelocityTask {
  id: string
  title: string
  xpSize: string
  points: number
  completionHours: number | null
}

/** Velocity breakdown by first tag category across all done tasks. */
export interface CategoryVelocity {
  category: string
  tasksCompleted: number
  totalPoints: number
  avgCompletionHours: number | null
}

/** Aggregated velocity across all sprints with per-sprint and overall metrics. */
export interface VelocitySummary {
  sprints: SprintVelocity[]
  byCategory: CategoryVelocity[]
  overall: {
    totalTasksCompleted: number
    totalPoints: number
    avgPointsPerSprint: number
    avgCompletionHours: number | null
  }
}

/**
 * Calculate velocity metrics for all sprints in the graph.
 */
export function calculateVelocity(doc: GraphDocument, filter?: { sprintId?: string; limit?: number }): VelocitySummary {
  const validatedFilter = VelocityFilterSchema.parse(filter ?? {})
  // Group done tasks by sprint
  const doneTasks = doc.nodes.filter((n) => n.status === 'done' && (n.type === 'task' || n.type === 'subtask'))

  const bySprint = new Map<string, GraphNode[]>()

  for (const node of doneTasks) {
    const sprint = node.sprint ?? '(no sprint)'
    const group = bySprint.get(sprint) ?? []
    group.push(node)
    bySprint.set(sprint, group)
  }

  const sprints: SprintVelocity[] = []

  for (const [sprint, tasks] of bySprint) {
    const velocityTasks: VelocityTask[] = tasks.map((t) => {
      const points = XP_SIZE_POINTS[t.xpSize ?? 'M'] ?? 3
      const completionHours = computeCompletionHours(t)
      return {
        id: t.id,
        title: t.title,
        xpSize: t.xpSize ?? 'M',
        points,
        completionHours,
      }
    })

    const totalPoints = velocityTasks.reduce((sum, t) => sum + t.points, 0)
    const hoursValues = velocityTasks.map((t) => t.completionHours).filter((h): h is number => h !== null)

    sprints.push({
      sprint,
      tasksCompleted: tasks.length,
      totalPoints,
      avgPointsPerTask: tasks.length > 0 ? Math.round((totalPoints / tasks.length) * 10) / 10 : 0,
      avgCompletionHours:
        hoursValues.length > 0
          ? Math.round((hoursValues.reduce((a, b) => a + b, 0) / hoursValues.length) * 10) / 10
          : null,
      tasks: velocityTasks,
    })
  }

  // Sort sprints by name, optionally filter by sprintId. Clone to avoid the
  // subtle aliasing bug where `filteredSprints === sprints` and the later
  // `sprints.length = 0` would blank both sides before the push.
  const filteredSprints = validatedFilter.sprintId
    ? sprints.filter((s) => s.sprint === validatedFilter.sprintId)
    : [...sprints]
  filteredSprints.sort((a, b) => a.sprint.localeCompare(b.sprint))
  sprints.length = 0
  sprints.push(...filteredSprints)

  const totalTasksCompleted = doneTasks.length
  const totalPoints = sprints.reduce((sum, s) => sum + s.totalPoints, 0)
  // E3-T05: Use real sprint count, not fallback || 1
  const sprintCount = sprints.length

  const allHours = sprints
    .flatMap((s) => s.tasks)
    .map((t) => t.completionHours)
    .filter((h): h is number => h !== null)

  // Group by category (first tag)
  const byCategoryMap = new Map<string, GraphNode[]>()
  for (const node of doneTasks) {
    const category = node.tags?.[0] ?? '(untagged)'
    const group = byCategoryMap.get(category) ?? []
    group.push(node)
    byCategoryMap.set(category, group)
  }

  const byCategory: CategoryVelocity[] = Array.from(byCategoryMap.entries())
    .map(([category, tasks]) => {
      const catPoints = tasks.reduce((sum, t) => sum + (XP_SIZE_POINTS[t.xpSize ?? 'M'] ?? 3), 0)
      const catHours = tasks.map((t) => computeCompletionHours(t)).filter((h): h is number => h !== null)
      return {
        category,
        tasksCompleted: tasks.length,
        totalPoints: catPoints,
        avgCompletionHours:
          catHours.length > 0 ? Math.round((catHours.reduce((a, b) => a + b, 0) / catHours.length) * 10) / 10 : null,
      }
    })
    .sort((a, b) => a.category.localeCompare(b.category))

  log.info(`Velocity: ${totalTasksCompleted} tasks done, ${totalPoints} points across ${sprints.length} sprints`)

  return {
    sprints,
    byCategory,
    overall: {
      totalTasksCompleted,
      totalPoints,
      avgPointsPerSprint: sprintCount > 0 ? Math.round((totalPoints / sprintCount) * 10) / 10 : 0,
      avgCompletionHours:
        allHours.length > 0 ? Math.round((allHours.reduce((a, b) => a + b, 0) / allHours.length) * 10) / 10 : null,
    },
  }
}

/**
 * Estimate completion time in hours from createdAt to updatedAt.
 * Returns null if timestamps are invalid or equal.
 */
function computeCompletionHours(node: GraphNode): number | null {
  try {
    // Bug #094 + E5-T02: guard null/undefined/empty timestamps before Date parse
    if (!node.createdAt?.trim() || !node.updatedAt?.trim()) return null
    const created = new Date(node.createdAt).getTime()
    const updated = new Date(node.updatedAt).getTime()
    if (isNaN(created) || isNaN(updated) || updated <= created) return null
    return Math.round(((updated - created) / (1000 * 60 * 60)) * 10) / 10
  } catch {
    return null
  }
}

// ── DORA Velocity Adjuster ─────────────────────────────────────────────────

export interface DoraAdjustmentInput {
  mttrHours: number
  changeFailureRate: number
  deploymentFrequencyPerDay: number
}

export interface DoraAdjustmentResult {
  adjustedVelocity: number
  appliedMultiplier: number
  reasons: string[]
}

const MTTR_THRESHOLD_HOURS = 4
const MTTR_PENALTY = 0.85
const CFR_THRESHOLD = 0.2
const CFR_PENALTY = 0.8
const DEPLOY_FREQ_THRESHOLD_PER_DAY = 1 / 7 // 1 per week
const DEPLOY_FREQ_PENALTY = 0.9

/**
 * Adjust sprint velocity based on DORA metrics.
 * Returns baseVelocity unchanged when doraMetrics is null (graceful fallback).
 * Penalties stack multiplicatively.
 */
export function applyDoraAdjustment(
  baseVelocity: number,
  doraMetrics: DoraAdjustmentInput | null,
): DoraAdjustmentResult {
  if (!doraMetrics) {
    return { adjustedVelocity: baseVelocity, appliedMultiplier: 1, reasons: [] }
  }

  let multiplier = 1
  const reasons: string[] = []

  if (doraMetrics.mttrHours > MTTR_THRESHOLD_HOURS) {
    multiplier *= MTTR_PENALTY
    reasons.push(`MTTR ${doraMetrics.mttrHours.toFixed(1)}h > ${MTTR_THRESHOLD_HOURS}h threshold (-15%)`)
  }

  if (doraMetrics.changeFailureRate > CFR_THRESHOLD) {
    multiplier *= CFR_PENALTY
    const pct = (doraMetrics.changeFailureRate * 100).toFixed(0)
    reasons.push(`CFR ${pct}% > ${CFR_THRESHOLD * 100}% threshold (-20%)`)
  }

  if (doraMetrics.deploymentFrequencyPerDay < DEPLOY_FREQ_THRESHOLD_PER_DAY) {
    multiplier *= DEPLOY_FREQ_PENALTY
    const freq = (doraMetrics.deploymentFrequencyPerDay * 7).toFixed(2)
    reasons.push(`deployment frequency ${freq}/week < 1/week threshold (-10%)`)
  }

  return {
    adjustedVelocity: Math.round(baseVelocity * multiplier * 100) / 100,
    appliedMultiplier: Math.round(multiplier * 1000) / 1000,
    reasons,
  }
}
