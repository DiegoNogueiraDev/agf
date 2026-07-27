/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_a0ef12c7d8be — Mapeia o estado do `SqliteStore` para o `DeliveryState`
 * consumido pelo orquestrador (O1/O2). Reusa findNextTask + detectLargeTasks
 * existentes. Determinístico sobre o snapshot do grafo.
 */
import type { SqliteStore } from '../store/sqlite-store.js'
import { findNextTask } from '../planner/next-task.js'
import { detectLargeTasks } from '../planner/decompose.js'
import type { DeliveryState } from './orchestrator.js'

const TASK_TYPES = new Set(['task', 'subtask'])
const REQUIREMENT_TYPES = new Set(['epic', 'requirement'])

const EMPTY_STATE: DeliveryState = {
  totalNodes: 0,
  hasRequirements: false,
  oversizedCount: 0,
  readyTasks: 0,
  inProgress: 0,
  allBlocked: false,
  doneRatio: 0,
}

/** Deriva o estado de entrega a partir do store. Store sem projeto → estado vazio. */
export function deriveDeliveryState(store: SqliteStore): DeliveryState {
  if (!store.getProject()) return { ...EMPTY_STATE }
  const stats = store.getStats()
  const doc = store.toGraphDocument()

  const hasRequirements = doc.nodes.some((n) => REQUIREMENT_TYPES.has(n.type))
  const oversizedCount = detectLargeTasks(doc).length

  const tasks = doc.nodes.filter((n) => TASK_TYPES.has(n.type))
  const done = tasks.filter((t) => t.status === 'done').length
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length
  const doneRatio = tasks.length > 0 ? done / tasks.length : 0

  const next = findNextTask(doc)
  const actionable = next !== null && !('warning' in next)
  const allBlocked = next !== null && 'warning' in next && next.warning === 'all_tasks_blocked'

  return {
    totalNodes: stats.totalNodes,
    hasRequirements,
    oversizedCount,
    readyTasks: actionable ? 1 : 0,
    inProgress,
    allBlocked,
    doneRatio,
  }
}
