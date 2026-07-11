/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Self-Healing Engine — MAPE-K control loop for proactive graph healing.
 *
 * Monitor → Analyze → Plan → Execute → Knowledge
 *
 * Extends the reactive self-healing-listener with proactive scanning.
 * All monitor/analyze/plan functions are pure (no side effects).
 * Only executeActions touches external state.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type {
  HealingIssue,
  HealingAction,
  HealingResult,
  HealingReport,
  HealingConfig,
  HealingMetrics,
  HealingIssueType,
  HealingSeverity,
} from '../../schemas/healing.schema.js'
import { generateId } from '../utils/id.js'
import { now } from '../utils/time.js'
import { createLogger } from '../utils/logger.js'
import { getNodeAcTexts } from '../utils/ac-helpers.js'
import { detectResolvedRisks } from '../insights/stale-risk.js'

const log = createLogger({ layer: 'core', source: 'self-healing-engine.ts' })

export const DEFAULT_HEALING_CONFIG: HealingConfig = {
  staleHours: 48,
  maxCycleDepth: 10,
  autoHeal: false,
  dryRun: true,
}

// ── Monitor Phase ──────────────────────────────────

/**
 * Scan the graph document for issues that need healing.
 * Pure function — no side effects.
 */
export function monitorGraph(doc: GraphDocument, config: HealingConfig): HealingIssue[] {
  log.info('self-healing:monitor', { nodes: doc.nodes.length, edges: doc.edges.length })

  const issues: HealingIssue[] = []
  const nodeIds = new Set(doc.nodes.map((n) => n.id))
  const timestamp = now()

  // 1. Stuck tasks — in_progress beyond staleHours
  const staleThreshold = Date.now() - config.staleHours * 60 * 60 * 1000
  for (const node of doc.nodes) {
    if (node.status === 'in_progress' && new Date(node.updatedAt).getTime() < staleThreshold) {
      issues.push({
        id: generateId('issue'),
        type: 'stuck_task',
        severity: 'high',
        nodeId: node.id,
        title: node.title,
        message: `Task "${node.title}" has been in_progress for over ${config.staleHours}h without update.`,
        suggestion: "Consider moving to 'blocked' status or investigating progress.",
        detectedAt: timestamp,
      })
    }
  }

  // 2. Broken dependencies — depends_on edge pointing to non-existent node
  for (const edge of doc.edges) {
    if (edge.relationType === 'depends_on' && !nodeIds.has(edge.to)) {
      const sourceNode = doc.nodes.find((n) => n.id === edge.from)
      issues.push({
        id: generateId('issue'),
        type: 'broken_dependency',
        severity: 'high',
        nodeId: edge.from,
        title: sourceNode?.title ?? edge.from,
        message: `Edge "${edge.id}" depends_on node "${edge.to}" which does not exist in the graph.`,
        suggestion: 'Remove the broken edge or create the missing dependency node.',
        detectedAt: timestamp,
      })
    }
  }

  // 3. Orphan nodes — task/subtask with no parent and no edges
  const nodesWithEdges = new Set<string>()
  for (const edge of doc.edges) {
    nodesWithEdges.add(edge.from)
    nodesWithEdges.add(edge.to)
  }
  for (const node of doc.nodes) {
    if ((node.type === 'task' || node.type === 'subtask') && !node.parentId && !nodesWithEdges.has(node.id)) {
      // Check if this node has children
      const hasChildren = doc.nodes.some((n) => n.parentId === node.id)
      if (!hasChildren) {
        issues.push({
          id: generateId('issue'),
          type: 'orphan_node',
          severity: 'low',
          nodeId: node.id,
          title: node.title,
          message: `Task "${node.title}" has no parent, no edges, and no children — completely isolated.`,
          suggestion: 'Assign a parent epic or connect via edges.',
          detectedAt: timestamp,
        })
      }
    }
  }

  // 4. Cycle detection — DFS for dependency cycles
  const dependsOnAdj = new Map<string, string[]>()
  for (const edge of doc.edges) {
    if (edge.relationType === 'depends_on') {
      const list = dependsOnAdj.get(edge.from) ?? []
      list.push(edge.to)
      dependsOnAdj.set(edge.from, list)
    }
  }
  const visitedGlobal = new Set<string>()
  const cycleNodes = new Set<string>()

  for (const startId of Array.from(dependsOnAdj.keys())) {
    if (visitedGlobal.has(startId)) continue
    const stack = new Set<string>()
    const dfs = (nodeId: string, depth: number): boolean => {
      if (depth > config.maxCycleDepth) return false
      if (stack.has(nodeId)) return true
      if (visitedGlobal.has(nodeId)) return false
      stack.add(nodeId)
      for (const neighbor of dependsOnAdj.get(nodeId) ?? []) {
        if (!nodeIds.has(neighbor)) continue // skip broken edges
        if (dfs(neighbor, depth + 1)) {
          cycleNodes.add(nodeId)
          return true
        }
      }
      stack.delete(nodeId)
      visitedGlobal.add(nodeId)
      return false
    }
    dfs(startId, 0)
  }

  for (const cycleNodeId of Array.from(cycleNodes)) {
    const node = doc.nodes.find((n) => n.id === cycleNodeId)
    issues.push({
      id: generateId('issue'),
      type: 'cycle_detected',
      severity: 'critical',
      nodeId: cycleNodeId,
      title: node?.title ?? cycleNodeId,
      message: `Node "${node?.title ?? cycleNodeId}" is part of a circular dependency chain.`,
      suggestion: 'Remove one of the depends_on edges to break the cycle.',
      detectedAt: timestamp,
    })
  }

  // 5. Oversized tasks without subtasks
  const oversizedSizes = new Set(['L', 'XL'])
  for (const node of doc.nodes) {
    if (
      (node.type === 'task' || node.type === 'epic') &&
      node.xpSize &&
      oversizedSizes.has(node.xpSize) &&
      node.status !== 'done'
    ) {
      const hasSubtasks = doc.nodes.some((n) => n.parentId === node.id)
      if (!hasSubtasks) {
        issues.push({
          id: generateId('issue'),
          type: 'oversized_undecomposed',
          severity: 'medium',
          nodeId: node.id,
          title: node.title,
          message: `Task "${node.title}" is sized ${node.xpSize} but has no subtasks.`,
          suggestion: 'Decompose into smaller subtasks (target: S or M).',
          detectedAt: timestamp,
        })
      }
    }
  }

  // 6. Blocked tasks without blocking edges or blocker flag reason
  for (const node of doc.nodes) {
    if (node.status === 'blocked') {
      const hasBlockingEdge = doc.edges.some(
        (e) =>
          (e.relationType === 'depends_on' && e.from === node.id) || (e.relationType === 'blocks' && e.to === node.id),
      )
      if (!hasBlockingEdge) {
        issues.push({
          id: generateId('issue'),
          type: 'blocked_no_blocker',
          severity: 'medium',
          nodeId: node.id,
          title: node.title,
          message: `Task "${node.title}" is marked as blocked but has no blocking edges.`,
          suggestion: "Either add a blocking dependency or change status to 'ready'.",
          detectedAt: timestamp,
        })
      }
    }
  }

  // 7. Done tasks with pending dependencies
  for (const node of doc.nodes) {
    if (node.status === 'done') {
      const pendingDeps = doc.edges.filter((e) => e.relationType === 'depends_on' && e.from === node.id)
      for (const dep of pendingDeps) {
        const depNode = doc.nodes.find((n) => n.id === dep.to)
        if (depNode && depNode.status !== 'done') {
          issues.push({
            id: generateId('issue'),
            type: 'done_with_pending_deps',
            severity: 'high',
            nodeId: node.id,
            title: node.title,
            message: `Task "${node.title}" is done but depends on "${depNode.title}" which is ${depNode.status}.`,
            suggestion: 'Verify the task is truly done or mark it back to in_progress.',
            detectedAt: timestamp,
          })
          break // one issue per node is enough
        }
      }
    }
  }

  // 8. Container epics blocking child tasks (no own AC + all children in backlog)
  for (const node of doc.nodes) {
    if (node.type !== 'epic' || node.status === 'done') continue
    if (getNodeAcTexts(doc, node.id).length > 0) continue
    const children = doc.nodes.filter((n) => n.parentId === node.id)
    if (children.length === 0) continue
    if (children.every((n) => n.status === 'backlog' || n.status === 'ready')) {
      issues.push({
        id: generateId('issue'),
        type: 'container_epic_blocking',
        severity: 'medium',
        nodeId: node.id,
        title: node.title,
        message: `Épico container "${node.title}" sem AC próprio — ${children.length} tarefa(s) filha(s) bloqueada(s) em backlog/ready.`,
        suggestion:
          'Marque o épico como done (--force) para desbloquear as tarefas filhas, ou adicione AC se tiver trabalho real.',
        detectedAt: timestamp,
      })
    }
  }

  // 9. Stale resolved risks — description reads resolved but status is still open
  for (const node of detectResolvedRisks(doc.nodes)) {
    issues.push({
      id: generateId('issue'),
      type: 'stale_resolved_risk',
      severity: 'low',
      nodeId: node.id,
      title: node.title,
      message: `Risk "${node.title}" description reads as resolved but status is still "${node.status}".`,
      suggestion: `Close it: agf node status ${node.id} done`,
      detectedAt: timestamp,
    })
  }

  log.info('self-healing:monitor:done', { issuesFound: issues.length })
  return issues
}

// ── Analyze Phase ──────────────────────────────────

const SEVERITY_ORDER: Record<HealingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

/**
 * Analyze and prioritize issues by severity.
 * Pure function — returns sorted and enriched issues.
 */
export function analyzeIssues(issues: HealingIssue[]): HealingIssue[] {
  log.info('self-healing:analyze', { issues: issues.length })

  return [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

// ── Plan Phase ──────────────────────────────────

const ACTION_MAP: Record<HealingIssueType, (issue: HealingIssue, doc: GraphDocument) => HealingAction | null> = {
  stuck_task: (issue) => ({
    id: generateId('action'),
    issueId: issue.id,
    type: 'update_status',
    nodeId: issue.nodeId,
    description: `Mark stuck task "${issue.title}" as blocked for review.`,
    params: { newStatus: 'blocked' },
  }),

  broken_dependency: (issue, doc) => {
    const edge = doc.edges.find(
      (e) => e.from === issue.nodeId && e.relationType === 'depends_on' && !doc.nodes.some((n) => n.id === e.to),
    )
    if (!edge) return null
    return {
      id: generateId('action'),
      issueId: issue.id,
      type: 'remove_edge',
      nodeId: issue.nodeId,
      description: `Remove broken dependency edge "${edge.id}" pointing to non-existent node.`,
      params: { edgeId: edge.id },
    }
  },

  orphan_node: (issue) => ({
    id: generateId('action'),
    issueId: issue.id,
    type: 'flag_for_review',
    nodeId: issue.nodeId,
    description: `Flag orphan task "${issue.title}" for human review — needs parent or connection.`,
  }),

  cycle_detected: (issue) => ({
    id: generateId('action'),
    issueId: issue.id,
    type: 'flag_for_review',
    nodeId: issue.nodeId,
    description: `Circular dependency detected involving "${issue.title}" — requires manual resolution.`,
  }),

  stale_in_progress: (issue) => ({
    id: generateId('action'),
    issueId: issue.id,
    type: 'update_status',
    nodeId: issue.nodeId,
    description: `Mark stale task "${issue.title}" as blocked.`,
    params: { newStatus: 'blocked' },
  }),

  missing_ac: (issue) => ({
    id: generateId('action'),
    issueId: issue.id,
    type: 'flag_for_review',
    nodeId: issue.nodeId,
    description: `Task "${issue.title}" near completion but missing acceptance criteria.`,
  }),

  oversized_undecomposed: (issue) => ({
    id: generateId('action'),
    issueId: issue.id,
    type: 'flag_for_review',
    nodeId: issue.nodeId,
    description: `Task "${issue.title}" is oversized (${issue.message}) — needs decomposition.`,
  }),

  blocked_no_blocker: (issue) => ({
    id: generateId('action'),
    issueId: issue.id,
    type: 'clear_blocked',
    nodeId: issue.nodeId,
    description: `Clear blocked status on "${issue.title}" — no actual blocker found.`,
    params: { newStatus: 'ready' },
  }),

  done_with_pending_deps: (issue) => ({
    id: generateId('action'),
    issueId: issue.id,
    type: 'flag_for_review',
    nodeId: issue.nodeId,
    description: `Task "${issue.title}" marked done but has unresolved dependencies.`,
  }),

  container_epic_blocking: (issue) => ({
    id: generateId('action'),
    issueId: issue.id,
    type: 'update_status',
    nodeId: issue.nodeId,
    description: `Mark container epic "${issue.title}" as done — no own AC, all children in backlog.`,
    params: { newStatus: 'done' },
  }),

  stale_resolved_risk: (issue) => ({
    id: generateId('action'),
    issueId: issue.id,
    type: 'flag_for_review',
    nodeId: issue.nodeId,
    description: `Risk "${issue.title}" description reads resolved but status is still open — verify and close.`,
  }),
}

/**
 * Generate concrete healing actions for each analyzed issue.
 * Pure function.
 */
export function planActions(issues: HealingIssue[], doc: GraphDocument): HealingAction[] {
  log.info('self-healing:plan', { issues: issues.length })

  const actions: HealingAction[] = []
  for (const issue of issues) {
    const generator = ACTION_MAP[issue.type]
    if (generator) {
      const action = generator(issue, doc)
      if (action) {
        actions.push(action)
      }
    }
  }

  log.info('self-healing:plan:done', { actionsGenerated: actions.length })
  return actions
}

// ── Execute Phase ──────────────────────────────────

export interface ExecuteOptions {
  dryRun: boolean
}

/**
 * Execute healing actions against the graph.
 * In dry-run mode, actions are validated but not applied.
 */
export function executeActions(actions: HealingAction[], doc: GraphDocument, options: ExecuteOptions): HealingResult[] {
  log.info('self-healing:execute', { actions: actions.length, dryRun: options.dryRun })

  const results: HealingResult[] = []
  const timestamp = now()

  for (const action of actions) {
    if (options.dryRun) {
      results.push({
        actionId: action.id,
        issueId: action.issueId,
        success: true,
        message: `[DRY-RUN] Would execute: ${action.description}`,
        appliedAt: timestamp,
      })
      continue
    }

    // Live execution — apply mutations to the graph document
    try {
      switch (action.type) {
        case 'update_status':
        case 'clear_blocked': {
          const node = doc.nodes.find((n) => n.id === action.nodeId)
          if (node && action.params?.newStatus) {
            node.status = action.params.newStatus as typeof node.status
            node.updatedAt = timestamp
            if (action.type === 'clear_blocked') {
              node.blocked = false
            }
          }
          break
        }
        case 'remove_edge': {
          if (action.params?.edgeId) {
            const idx = doc.edges.findIndex((e) => e.id === action.params?.edgeId)
            if (idx >= 0) doc.edges.splice(idx, 1)
          }
          break
        }
        case 'flag_for_review':
        case 'add_flag': {
          const node = doc.nodes.find((n) => n.id === action.nodeId)
          if (node) {
            node.metadata = { ...node.metadata, healingReview: true }
            node.updatedAt = timestamp
          }
          break
        }
      }

      results.push({
        actionId: action.id,
        issueId: action.issueId,
        success: true,
        message: `Applied: ${action.description}`,
        appliedAt: timestamp,
      })
    } catch (err) {
      results.push({
        actionId: action.id,
        issueId: action.issueId,
        success: false,
        message: `Failed: ${String(err)}`,
        appliedAt: timestamp,
      })
    }
  }

  log.info('self-healing:execute:done', {
    total: results.length,
    success: results.filter((r) => r.success).length,
  })
  return results
}

// ── Knowledge Phase ──────────────────────────────────

/**
 * Build a healing report with aggregated metrics.
 * Pure function.
 */
export function buildKnowledge(
  issues: HealingIssue[],
  actions: HealingAction[],
  results: HealingResult[],
): HealingReport {
  log.info('self-healing:knowledge', { issues: issues.length, results: results.length })

  const totalHealed = results.filter((r) => r.success).length
  const totalFailed = results.filter((r) => !r.success).length
  const total = totalHealed + totalFailed
  const successRate = total > 0 ? totalHealed / total : 1

  // Compute average resolution time (placeholder — all same timestamp in dry-run)
  const avgResolutionMs = 0

  // Count by severity
  const bySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const issue of issues) {
    bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1
  }

  // Count by issue type
  const byIssueType: Record<string, number> = {}
  for (const issue of issues) {
    byIssueType[issue.type] = (byIssueType[issue.type] ?? 0) + 1
  }

  const metrics: HealingMetrics = {
    totalIssuesDetected: issues.length,
    totalHealed,
    totalFailed,
    successRate,
    avgResolutionMs,
    bySeverity: bySeverity as HealingMetrics['bySeverity'],
    byIssueType: byIssueType as HealingMetrics['byIssueType'],
  }

  return {
    id: generateId('report'),
    timestamp: now(),
    issues,
    actions,
    results,
    metrics,
  }
}
