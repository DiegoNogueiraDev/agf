/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Execution planner: suggests the next best task to work on.
 *
 * Algorithm:
 * 1. Filter nodes of type task/subtask with status backlog or ready
 * 2. Eliminate nodes with unresolved depends_on edges (dependency target not done)
 * 3. Eliminate nodes with blocked = true
 * 4. Sort by: priority ASC, xpSize ASC, estimateMinutes ASC, createdAt ASC
 */

import type { GraphDocument, GraphNode, GraphEdge } from '../graph/graph-types.js'
import { computeWsjf } from './wsjf-score.js'
import { XP_SIZE_ORDER } from '../utils/xp-sizing.js'
import { getNodeAcTexts } from '../utils/ac-helpers.js'
import { PlannerError } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'
import { emitTransversalHook } from '../hooks/transversal-lifecycle-hooks.js'

const log = createLogger({ layer: 'core', source: 'next-task.ts' })

export interface NextTaskResult {
  node: GraphNode
  reason: string
  /** E5-T01: Warning when all eligible tasks are blocked by dependencies */
  warning?: 'all_tasks_blocked'
}

export interface NextTaskOptions {
  /** Task IDs locked by other agents — excluded from results (teamTask mode) */
  lockedTaskIds?: Set<string>
  /** File paths being touched by other in-flight tasks — candidates overlapping these are excluded */
  inFlightTouchedFiles?: Set<string>
  /**
   * When true, treat epics with no own AC and all children in backlog as transparent
   * containers — their depends_on edges are ignored when selecting child tasks.
   * Use in leafcutter loops to unblock graphs built with `agf import-prd --build-tree`.
   */
  pierceContainers?: boolean
  /**
   * AUDIT-058: when true, enforce WIP=1 at the puller — return null if any task
   * is already `in_progress` (Little's Law). Opt-in so existing callers are
   * byte-identical; the leafcutter/autopilot loops pass it to prevent two
   * concurrent `agf start`/recovered runs from holding two tasks at once.
   */
  enforceWip?: boolean
}

/**
 * União dos arquivos declarados de um node (implementationFiles + testFiles +
 * metadata.touchedFiles) — a fronteira de escopo reconhecida entre agentes
 * (node_a268188b9c2e). Fonte única: o filtro de candidatas (Step 1.6) e a
 * coleta de arquivos em voo (claim-next-task) leem daqui.
 */
export function declaredFilesOf(node: GraphNode): string[] {
  const meta = (node.metadata as Record<string, unknown> | undefined)?.touchedFiles
  const fromMeta = Array.isArray(meta) ? meta.filter((f): f is string => typeof f === 'string') : []
  return [...new Set([...(node.implementationFiles ?? []), ...(node.testFiles ?? []), ...fromMeta])]
}

/**
 * Dono durável registrado da task (metadata.claimedBy não-vazio) ou undefined
 * (node legado/sem dono). Fonte única do protocolo-formiga: anti-hijack do
 * next, coleta de arquivos em voo do claim e a visão da colônia leem daqui.
 */
export function claimedByOf(node: { metadata?: unknown }): string | undefined {
  const claimedBy = (node.metadata as Record<string, unknown> | undefined)?.claimedBy
  return typeof claimedBy === 'string' && claimedBy.length > 0 ? claimedBy : undefined
}

/** Find the highest-priority unblocked task to work on next. */
export function findNextTask(doc: GraphDocument, options?: NextTaskOptions): NextTaskResult | null {
  if (!doc || !doc.nodes) {
    throw new PlannerError('Invalid graph document: missing nodes')
  }
  const { lockedTaskIds, inFlightTouchedFiles, pierceContainers, enforceWip } = options ?? {}

  // Step 0 (AUDIT-058): WIP=1 guard — refuse to surface a task while one is
  // already in_progress, so the puller can't hand out a second concurrent task.
  if (enforceWip && doc.nodes.some((n) => n.status === 'in_progress')) {
    log.debug('next:wip-guard', { reason: 'a task is already in_progress' })
    return null
  }

  // Step 1: Filter eligible nodes
  let eligible = doc.nodes.filter(
    (n) =>
      (n.type === 'task' || n.type === 'subtask') && (n.status === 'backlog' || n.status === 'ready') && !n.blocked,
  )

  // Step 1.5: Exclude tasks locked by other agents (teamTask mode)
  if (lockedTaskIds && lockedTaskIds.size > 0) {
    eligible = eligible.filter((n) => !lockedTaskIds.has(n.id))
    log.debug('next:lock-filter', { excluded: lockedTaskIds.size, remaining: eligible.length })
  }

  // Step 1.6: Exclude candidates whose declared files overlap with in-flight files
  if (inFlightTouchedFiles && inFlightTouchedFiles.size > 0) {
    const before = eligible.length
    eligible = eligible.filter((n) => {
      const declared = declaredFilesOf(n)
      if (declared.length === 0) return true
      return !declared.some((f) => inFlightTouchedFiles.has(f))
    })
    log.debug('next:file-overlap-filter', { excluded: before - eligible.length, remaining: eligible.length })
  }

  log.debug('Next task candidates', {
    eligible: eligible.length,
    total: doc.nodes.length,
  })
  if (eligible.length === 0) return null

  // Step 2: Build a set of done node IDs for dependency checking
  const doneIds = new Set(doc.nodes.filter((n) => n.status === 'done').map((n) => n.id))

  // Step 2.5: Build container epic set when pierce mode is active
  const containerEpicIds = pierceContainers ? buildContainerEpicIds(doc) : null
  if (containerEpicIds && containerEpicIds.size > 0) {
    log.debug('next:pierce-containers', { containerCount: containerEpicIds.size })
  }

  // Step 3: Find unresolved depends_on counts in one pass (avoid O(tasks*edges))
  const eligibleIds = new Set(eligible.map((n) => n.id))
  const unresolvedDepCount = new Map<string, number>()
  for (const node of eligible) {
    unresolvedDepCount.set(node.id, 0)
  }

  // Step 3.5: Precompute incoming depends_on counts for blocking impact
  const incomingDependsCount = new Map<string, number>()

  for (const edge of doc.edges) {
    if (edge.relationType !== 'depends_on') continue

    incomingDependsCount.set(edge.to, (incomingDependsCount.get(edge.to) ?? 0) + 1)

    if (eligibleIds.has(edge.from) && !doneIds.has(edge.to)) {
      // In pierce mode, skip depends_on edges that point to container epics
      if (containerEpicIds?.has(edge.to)) continue
      unresolvedDepCount.set(edge.from, (unresolvedDepCount.get(edge.from) ?? 0) + 1)
    }
  }

  const unblocked = eligible.filter((node) => (unresolvedDepCount.get(node.id) ?? 0) === 0)

  if (unblocked.length === 0) {
    // All eligible tasks have unresolved dependencies — return the one with fewest deps
    const withDepCount = eligible.map((node) => {
      return { node, pendingDeps: unresolvedDepCount.get(node.id) ?? 0 }
    })
    withDepCount.sort((a, b) => a.pendingDeps - b.pendingDeps)
    log.debug('next:all-blocked', {
      eligibleCount: eligible.length,
      bestPendingDeps: withDepCount[0].pendingDeps,
    })
    return {
      node: withDepCount[0].node,
      reason: `Todas as tasks têm dependências pendentes. Esta tem menos (${withDepCount[0].pendingDeps}).`,
      warning: 'all_tasks_blocked',
    }
  }

  // Step 4: Topological rank from priority_over edges (Kahn's algorithm)
  const priorityRank = computePriorityRank(unblocked, doc.edges)

  // Step 4.5: Compute blocking impact (how many downstream tasks depend on each)
  const blockingImpact = new Map<string, number>()
  for (const node of unblocked) {
    blockingImpact.set(node.id, incomingDependsCount.get(node.id) ?? 0)
  }

  // Step 5: Sort
  // WSJF pré-computado com UM nowMs — comparator determinístico durante o sort.
  const wsjfNowMs = Date.now()
  const wsjfById = new Map(unblocked.map((n) => [n.id, computeWsjf(n, { nowMs: wsjfNowMs }).wsjf]))

  unblocked.sort((a, b) => {
    // Priority_over topological rank ASC (lower rank = higher priority)
    const rankA = priorityRank.get(a.id) ?? Infinity
    const rankB = priorityRank.get(b.id) ?? Infinity
    if (rankA !== rankB) return rankA - rankB

    // Blocking impact DESC (tasks that unblock others go first)
    const impactA = blockingImpact.get(a.id) ?? 0
    const impactB = blockingImpact.get(b.id) ?? 0
    if (impactA !== impactB) return impactB - impactA

    // Priority ASC (1 = critical, 5 = optional)
    if (a.priority !== b.priority) return a.priority - b.priority

    // WSJF DESC dentro da banda de prioridade (node_b9c002916d15): CoD
    // (MoSCoW + idade) / JobSize refina a ordem SEM cruzar bandas — o
    // aco-select herda isto no caminho determinístico (delega pra cá).
    const wsjfA = wsjfById.get(a.id) ?? 0
    const wsjfB = wsjfById.get(b.id) ?? 0
    if (wsjfA !== wsjfB) return wsjfB - wsjfA

    // XP size ASC
    const sizeA = XP_SIZE_ORDER[a.xpSize || 'M'] ?? 3
    const sizeB = XP_SIZE_ORDER[b.xpSize || 'M'] ?? 3
    if (sizeA !== sizeB) return sizeA - sizeB

    // Estimate ASC
    const estA = a.estimateMinutes ?? 999
    const estB = b.estimateMinutes ?? 999
    if (estA !== estB) return estA - estB

    // Prefer tasks with more acceptance criteria (clearer definition)
    const acA = getNodeAcTexts(doc, a.id).length
    const acB = getNodeAcTexts(doc, b.id).length
    if (acA !== acB) return acB - acA

    // CreatedAt ASC (older first) — Bug #093: guard null
    return (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
  })

  const best = unblocked[0]
  // Hook: a task escolhida tinha depends_on (agora resolvidas) → dependency resolvida.
  if (doc.edges.some((e) => e.relationType === 'depends_on' && e.from === best.id)) {
    emitTransversalHook('on_dependency_resolved', { nodeId: best.id, title: best.title })
  }
  const reasons: string[] = ['desbloqueada']
  if (best.priority <= 2) reasons.push('alta prioridade')
  if (best.xpSize && XP_SIZE_ORDER[best.xpSize] <= 2) reasons.push('baixa complexidade')

  log.debug('next:selected', {
    nodeId: best.id,
    title: best.title,
    priority: best.priority,
    candidatesCount: unblocked.length,
    reason: reasons.join(', '),
  })

  return {
    node: best,
    reason: reasons.join(', '),
  }
}

/**
 * Identify epics that act as pure containers: no own AC and all children in backlog/ready.
 * These epics are transparent to task selection — their depends_on edges can be pierced.
 */
function buildContainerEpicIds(doc: GraphDocument): Set<string> {
  const containerIds = new Set<string>()
  for (const node of doc.nodes) {
    if (node.type !== 'epic' || node.status === 'done') continue
    if (getNodeAcTexts(doc, node.id).length > 0) continue
    const children = doc.nodes.filter((n) => n.parentId === node.id)
    if (children.length === 0) continue
    if (children.every((n) => n.status === 'backlog' || n.status === 'ready')) {
      containerIds.add(node.id)
    }
  }
  return containerIds
}

/**
 * Return all unblocked task/subtask candidates from the graph without selecting one.
 * Used by --aco mode to feed the full candidate set to pheromoneWeightedSelect.
 * Does NOT sort or apply any selection strategy — caller decides.
 */
export function findUnblockedTasks(doc: GraphDocument): GraphNode[] {
  const eligible = doc.nodes.filter(
    (n) =>
      (n.type === 'task' || n.type === 'subtask') && (n.status === 'backlog' || n.status === 'ready') && !n.blocked,
  )
  if (eligible.length === 0) return []

  const doneIds = new Set(doc.nodes.filter((n) => n.status === 'done').map((n) => n.id))
  const eligibleIds = new Set(eligible.map((n) => n.id))
  const unresolvedDepCount = new Map<string, number>()
  for (const node of eligible) unresolvedDepCount.set(node.id, 0)

  for (const edge of doc.edges) {
    if (edge.relationType !== 'depends_on') continue
    if (eligibleIds.has(edge.from) && !doneIds.has(edge.to)) {
      unresolvedDepCount.set(edge.from, (unresolvedDepCount.get(edge.from) ?? 0) + 1)
    }
  }

  return eligible.filter((n) => (unresolvedDepCount.get(n.id) ?? 0) === 0)
}

/**
 * Kahn's algorithm topological sort on priority_over edges.
 * Returns a map of nodeId → rank (0 = highest priority).
 * Nodes in cycles get no rank (treated as Infinity in sort).
 */
function computePriorityRank(candidates: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const candidateIds = new Set(candidates.map((n) => n.id))
  const rank = new Map<string, number>()

  // Filter priority_over edges where both endpoints are in the candidate set
  const relevantEdges = edges.filter(
    (e) => e.relationType === 'priority_over' && candidateIds.has(e.from) && candidateIds.has(e.to),
  )

  if (relevantEdges.length === 0) return rank

  // Build adjacency list and in-degree count
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()

  for (const id of candidateIds) {
    inDegree.set(id, 0)
    adj.set(id, [])
  }

  for (const edge of relevantEdges) {
    ;(adj.get(edge.from) as string[]).push(edge.to)
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
  }

  // Kahn's: start with nodes that have 0 in-degree
  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  let currentRank = 0
  while (queue.length > 0) {
    const batch = [...queue]
    queue.length = 0

    for (const id of batch) {
      rank.set(id, currentRank)
      for (const neighbor of adj.get(id) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 0) - 1
        inDegree.set(neighbor, newDeg)
        if (newDeg === 0) queue.push(neighbor)
      }
    }
    currentRank++
  }

  // Nodes still not in rank are part of cycles — they get no rank (Infinity in sort)
  return rank
}
