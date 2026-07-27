/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-dynamic-replanning Task 1.3 — Dynamic replan suggestion.
 *
 * Pure function: reads graph structure + node_changelog for timing data,
 * detects cycle-time divergence (>50%) and parent-blocking patterns (≥3 tasks),
 * returns a ReplanProposal ordered with dependency-break first.
 */

import type Database from 'better-sqlite3'
import type { GraphDocument, GraphNode, XpSize } from '../graph/graph-types.js'
import { generateId } from '../utils/id.js'
import { createLogger } from '../utils/logger.js'

const _log = createLogger({ layer: 'core', source: 'planner/replan-analyzer.ts' })

// ── Types ────────────────────────────────────────────────────────────────────

export type ReplanAction = 'move' | 'reprioritize' | 'break_dependency'

export interface ReplanProposalItem {
  action: ReplanAction
  nodeId: string
  nodeTitle: string
  justification: string
  targetSprint?: string
  newPriority?: number
  dependencyToBreak?: { from: string; to: string; edgeId?: string }
}

export interface ReplanMetrics {
  cycleTimeDivergencePct?: number
  overdueTaskCount: number
  parentBlockingPattern?: { parentId: string; parentTitle: string; blockedCount: number }
}

export interface ReplanReport {
  proposalId: string
  healthStatus: 'healthy' | 'unhealthy'
  proposals: ReplanProposalItem[]
  metrics: ReplanMetrics
  generatedAt: string
  sprintFilter: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const XP_MINUTES: Record<XpSize, number> = {
  XS: 30,
  S: 60,
  M: 180,
  L: 480,
  XL: 960,
}
const DEFAULT_ESTIMATE_MINUTES = 60
const DIVERGENCE_THRESHOLD = 1.5 // >50% over estimate
const BLOCKING_PARENT_MIN = 3 // ≥3 tasks blocked by same parent

// ── Changelog queries ─────────────────────────────────────────────────────────

interface ChangelogRow {
  node_id: string
  new_value: string
  changed_at: string
}

function queryStatusChanges(
  db: Database.Database,
  nodeIds: string[],
): Map<string, { inProgressAt?: string; doneAt?: string }> {
  const result = new Map<string, { inProgressAt?: string; doneAt?: string }>()
  if (nodeIds.length === 0) return result

  let rows: ChangelogRow[]
  try {
    const placeholders = nodeIds.map(() => '?').join(',')
    rows = db
      .prepare(
        `SELECT node_id, new_value, changed_at
         FROM node_changelog
         WHERE node_id IN (${placeholders})
           AND field = 'status'
           AND new_value IN ('in_progress', 'done')
         ORDER BY changed_at ASC`,
      )
      .all(...nodeIds) as ChangelogRow[]
  } catch {
    return result
  }

  for (const row of rows) {
    if (!result.has(row.node_id)) {
      result.set(row.node_id, {})
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §fix-ci-lint
    const entry = result.get(row.node_id)!
    if (row.new_value === 'in_progress' && !entry.inProgressAt) {
      entry.inProgressAt = row.changed_at
    }
    if (row.new_value === 'done') {
      entry.doneAt = row.changed_at
    }
  }

  return result
}

// ── Estimate resolution ───────────────────────────────────────────────────────

function resolveEstimateMinutes(node: GraphNode): number {
  if (node.estimateMinutes != null && node.estimateMinutes > 0) return node.estimateMinutes
  if (node.xpSize && XP_MINUTES[node.xpSize]) return XP_MINUTES[node.xpSize]
  return DEFAULT_ESTIMATE_MINUTES
}

// ── Cycle-time divergence detection ──────────────────────────────────────────

interface CycleTimeFact {
  node: GraphNode
  actualMinutes: number
  estimateMinutes: number
  divergencePct: number
}

function detectCycleTimeDivergence(sprintTasks: GraphNode[], db: Database.Database): CycleTimeFact[] {
  const doneTasks = sprintTasks.filter((t) => t.status === 'done')
  if (doneTasks.length === 0) return []

  const timing = queryStatusChanges(
    db,
    doneTasks.map((t) => t.id),
  )
  const facts: CycleTimeFact[] = []

  for (const task of doneTasks) {
    const t = timing.get(task.id)
    if (!t?.inProgressAt || !t.doneAt) continue

    const actualMs = new Date(t.doneAt).getTime() - new Date(t.inProgressAt).getTime()
    if (actualMs <= 0) continue

    const actualMinutes = actualMs / 60_000
    const estimate = resolveEstimateMinutes(task)
    const divergencePct = actualMinutes / estimate

    if (divergencePct > DIVERGENCE_THRESHOLD) {
      facts.push({ node: task, actualMinutes, estimateMinutes: estimate, divergencePct })
    }
  }

  return facts
}

// ── Parent-blocking pattern detection ────────────────────────────────────────

interface BlockingPattern {
  parentId: string
  parentTitle: string
  blockedTasks: Array<{ nodeId: string; edgeId?: string }>
}

function detectParentBlocking(sprintTasks: GraphNode[], doc: GraphDocument): BlockingPattern | null {
  const sprintTaskIds = new Set(sprintTasks.map((t) => t.id))
  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]))

  // Count depends_on targets within sprint tasks pointing to undone nodes
  const dependencyCount = new Map<string, Array<{ nodeId: string; edgeId?: string }>>()

  for (const edge of doc.edges) {
    if (edge.relationType !== 'depends_on') continue
    if (!sprintTaskIds.has(edge.from)) continue

    const target = nodeById.get(edge.to)
    if (!target || target.status === 'done') continue

    if (!dependencyCount.has(edge.to)) dependencyCount.set(edge.to, [])
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §fix-ci-lint
    dependencyCount.get(edge.to)!.push({ nodeId: edge.from, edgeId: edge.id })
  }

  // Find the worst blocker (most blocked tasks)
  let worst: { parentId: string; blocked: Array<{ nodeId: string; edgeId?: string }> } | null = null
  for (const [parentId, blocked] of dependencyCount) {
    if (blocked.length >= BLOCKING_PARENT_MIN) {
      if (!worst || blocked.length > worst.blocked.length) {
        worst = { parentId, blocked }
      }
    }
  }

  if (!worst) return null

  const parent = nodeById.get(worst.parentId)
  return {
    parentId: worst.parentId,
    parentTitle: parent?.title ?? worst.parentId,
    blockedTasks: worst.blocked,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyze the current sprint and propose structural refactoring when:
 * 1. Cycle time diverges >50% from estimate
 * 2. ≥3 tasks share the same blocking dependency
 *
 * Returns { healthStatus: "healthy", proposals: [] } for healthy sprints.
 */
export function analyzeReplanSuggest(
  doc: GraphDocument,
  db: Database.Database,
  sprintFilter?: string | null,
): ReplanReport {
  const sprintTasks = doc.nodes.filter(
    (n) => (n.type === 'task' || n.type === 'subtask') && (sprintFilter ? n.sprint === sprintFilter : true),
  )

  const proposals: ReplanProposalItem[] = []
  const metrics: ReplanMetrics = { overdueTaskCount: 0 }

  // ── 1. Parent-blocking pattern (AC2 — first suggestion if found) ────────────
  const blocking = detectParentBlocking(sprintTasks, doc)
  if (blocking) {
    metrics.parentBlockingPattern = {
      parentId: blocking.parentId,
      parentTitle: blocking.parentTitle,
      blockedCount: blocking.blockedTasks.length,
    }

    // First edge is the representative break point
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- §fix-ci-lint
    const rep = blocking.blockedTasks[0]!
    proposals.push({
      action: 'break_dependency',
      nodeId: blocking.parentId,
      nodeTitle: blocking.parentTitle,
      justification: `${blocking.blockedTasks.length} tasks in sprint depend on "${blocking.parentTitle}" which is not done. Breaking this dependency unblocks the sprint.`,
      dependencyToBreak: { from: rep.nodeId, to: blocking.parentId, edgeId: rep.edgeId },
    })
  }

  // ── 2. Cycle-time divergence (AC1) ──────────────────────────────────────────
  const diverged = detectCycleTimeDivergence(sprintTasks, db)
  metrics.overdueTaskCount = diverged.length

  if (diverged.length > 0) {
    const avgDivergence = diverged.reduce((sum, f) => sum + f.divergencePct, 0) / diverged.length
    metrics.cycleTimeDivergencePct = Math.round((avgDivergence - 1) * 100)

    for (const fact of diverged) {
      proposals.push({
        action: 'reprioritize',
        nodeId: fact.node.id,
        nodeTitle: fact.node.title,
        justification: `cycle_time real ${Math.round(fact.actualMinutes)}min vs estimado ${fact.estimateMinutes}min (${Math.round((fact.divergencePct - 1) * 100)}% acima). Considere mover para próximo sprint ou decompor.`,
        newPriority: Math.max(1, (fact.node.priority ?? 3) - 1),
      })
    }
  }

  // ── 3. Health determination (AC3) ────────────────────────────────────────────
  // Healthy = no actionable proposals generated. The 20% threshold is the
  // lower bound that guarantees healthy; >50% guarantees unhealthy; the
  // 20-50% gray zone produces no proposals, so the sprint is still healthy.
  const healthStatus: 'healthy' | 'unhealthy' = proposals.length === 0 ? 'healthy' : 'unhealthy'

  return {
    proposalId: generateId('rp'),
    healthStatus,
    proposals,
    metrics,
    generatedAt: new Date().toISOString(),
    sprintFilter: sprintFilter ?? null,
  }
}
