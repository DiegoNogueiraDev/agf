/*!
 * scaffold-guided-starter — idempotent starter scaffold for empty graphs.
 *
 * WHY: A freshly-initialized graph has nothing for `agf start` to pull.
 * This creates ONE sample epic + ONE atomic task with AC so a new agent
 * immediately has a runnable task. Non-destructive: skips if graph already
 * has any task or subtask nodes.
 *
 * Composes with: sqlite-store.ts (insertNode), graph-types.ts (GraphNode).
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import type { GraphNode } from '../graph/graph-types.js'

export interface GuidedScaffoldResult {
  added: boolean
  epicId?: string
  taskId?: string
}

/** Scaffold a starter epic + task if the graph is empty. Idempotent. */
export function scaffoldGuidedStarter(store: SqliteStore): GuidedScaffoldResult {
  const doc = store.toGraphDocument()
  const hasTasks = doc.nodes.some((n) => n.type === 'task' || n.type === 'subtask')
  if (hasTasks) return { added: false }

  const now = new Date().toISOString()
  const epicId = `epic_guided_${Date.now()}`
  const taskId = `task_guided_${Date.now()}`
  const ac1Id = `ac_guided_1_${Date.now()}`
  const ac2Id = `ac_guided_2_${Date.now()}`

  const epic: GraphNode = {
    id: epicId,
    type: 'epic',
    title: 'Getting Started Epic',
    status: 'backlog',
    priority: 3,
    blocked: false,
    description: 'Sample epic created by agf init --guided. Replace with your own.',
    createdAt: now,
    updatedAt: now,
  }

  const task: GraphNode = {
    id: taskId,
    type: 'task',
    title: 'My first task — replace with your own',
    status: 'backlog',
    priority: 3,
    blocked: false,
    parentId: epicId,
    description: 'Sample atomic task. Run `agf start` to begin TDD on it.',
    createdAt: now,
    updatedAt: now,
  }

  const ac1: GraphNode = {
    id: ac1Id,
    type: 'acceptance_criteria',
    title: 'Given the feature, when triggered, then the expected outcome occurs.',
    status: 'backlog',
    priority: 3,
    blocked: false,
    parentId: taskId,
    createdAt: now,
    updatedAt: now,
  }

  const ac2: GraphNode = {
    id: ac2Id,
    type: 'acceptance_criteria',
    title: 'Given invalid input, when triggered, then an error is returned.',
    status: 'backlog',
    priority: 3,
    blocked: false,
    parentId: taskId,
    createdAt: now,
    updatedAt: now,
  }

  store.insertNode(epic)
  store.insertNode(task)
  store.insertNode(ac1)
  store.insertNode(ac2)

  return { added: true, epicId, taskId }
}
