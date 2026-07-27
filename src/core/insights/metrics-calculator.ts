/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { GraphDocument, GraphNode, NodeStatus } from '../graph/graph-types.js'
import { calculateVelocity } from '../planner/velocity.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'metrics-calculator.ts' })

export interface StatusDistribution {
  status: NodeStatus
  count: number
  percentage: number
}

export interface MetricsReport {
  totalNodes: number
  totalTasks: number
  completionRate: number
  statusDistribution: StatusDistribution[]
  velocity: {
    tasksCompleted: number
    avgPointsPerTask: number
    avgCompletionHours: number
  }
  sprintProgress: SprintProgress[]
}

export interface SprintProgress {
  sprint: string
  total: number
  done: number
  inProgress: number
  blocked: number
  percentage: number
}

const ALL_STATUSES: NodeStatus[] = ['backlog', 'ready', 'in_progress', 'blocked', 'done']

/**
 * Calculate comprehensive metrics from the graph.
 */
export function calculateMetrics(doc: GraphDocument): MetricsReport {
  log.info('Calculating metrics', { nodes: doc.nodes.length })

  const tasks = doc.nodes.filter((n) => n.type === 'task' || n.type === 'subtask')
  const doneTasks = tasks.filter((n) => n.status === 'done')

  // Status distribution
  const statusCounts = new Map<NodeStatus, number>()
  for (const status of ALL_STATUSES) statusCounts.set(status, 0)
  for (const node of doc.nodes) {
    const count = statusCounts.get(node.status) ?? 0
    statusCounts.set(node.status, count + 1)
  }

  const totalNodes = doc.nodes.length
  const statusDistribution: StatusDistribution[] = ALL_STATUSES.map((status) => {
    const count = statusCounts.get(status) ?? 0
    return {
      status,
      count,
      percentage: totalNodes > 0 ? Math.round((count / totalNodes) * 100) : 0,
    }
  })

  // Velocity from existing planner
  let velocityData = { tasksCompleted: 0, avgPointsPerTask: 0, avgCompletionHours: 0 }
  try {
    const velocity = calculateVelocity(doc)
    velocityData = {
      tasksCompleted: velocity.overall.totalTasksCompleted,
      avgPointsPerTask:
        velocity.overall.totalPoints > 0 && velocity.overall.totalTasksCompleted > 0
          ? Math.round((velocity.overall.totalPoints / velocity.overall.totalTasksCompleted) * 10) / 10
          : 0,
      avgCompletionHours: velocity.overall.avgCompletionHours ?? 0,
    }
  } catch (err) {
    log.debug('intentional-swallow', { error: String(err), reason: 'velocity calculation may fail with no sprints' })
  }

  // Sprint progress
  const sprintMap = new Map<string, GraphNode[]>()
  for (const task of tasks) {
    const sprint = task.sprint ?? '__unassigned__'
    const list = sprintMap.get(sprint) ?? []
    list.push(task)
    sprintMap.set(sprint, list)
  }

  const sprintProgress: SprintProgress[] = []
  for (const [sprint, sprintTasks] of sprintMap) {
    if (sprint === '__unassigned__') continue
    const total = sprintTasks.length
    const done = sprintTasks.filter((t) => t.status === 'done').length
    const inProgress = sprintTasks.filter((t) => t.status === 'in_progress').length
    const blocked = sprintTasks.filter((t) => t.status === 'blocked' || t.blocked).length
    sprintProgress.push({
      sprint,
      total,
      done,
      inProgress,
      blocked,
      percentage: total > 0 ? Math.round((done / total) * 100) : 0,
    })
  }

  sprintProgress.sort((a, b) => a.sprint.localeCompare(b.sprint))

  return {
    totalNodes,
    totalTasks: tasks.length,
    completionRate: tasks.length > 0 ? Math.round((doneTasks.length / tasks.length) * 100) : 0,
    statusDistribution,
    velocity: velocityData,
    sprintProgress,
  }
}
