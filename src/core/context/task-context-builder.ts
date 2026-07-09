/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Assembles a compact TaskContext from the SQLite store or a graph snapshot.
 * WHY: central builder that collapses neighborhood queries into a typed struct
 * the agent can read without additional round-trips. Composing: compact-context-types.ts
 * (types), action-deriver.ts (verdict), token-estimator.ts, context-lifecycle-hooks.ts.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import type { GraphNode, GraphEdge } from '../graph/graph-types.js'
import type { GraphSnapshot } from '../store/graph-snapshot-cache.js'
import type { TaskContext, TaskSummary, BlockerInfo, DependencyInfo, SourceRefInfo } from './compact-context-types.js'
import { getNodeAcFromStore } from '../utils/ac-helpers.js'
import { estimateTokens } from './token-estimator.js'
import { emitContextHook } from '../hooks/context-lifecycle-hooks.js'
import { deriveNextAction } from './action-deriver.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'task-context-builder.ts' })

function toTaskSummary(node: GraphNode): TaskSummary {
  const summary: TaskSummary = {
    id: node.id,
    type: node.type,
    title: node.title,
    status: node.status,
    priority: node.priority,
  }
  if (node.description) summary.description = node.description
  if (node.sprint) summary.sprint = node.sprint
  if (node.xpSize) summary.xpSize = node.xpSize
  if (node.tags?.length) summary.tags = node.tags
  return summary
}

function isInferred(edge: GraphEdge): boolean {
  return edge.metadata?.inferred === true
}

/** Build a compact task context with neighbors and metrics. */
export function buildTaskContext(store: SqliteStore, nodeId: string, snapshot?: GraphSnapshot): TaskContext | null {
  emitContextHook('pre_context_build', { nodeId })
  const snapshotNodeById = snapshot ? new Map(snapshot.nodes.map((n) => [n.id, n])) : null

  // Helper: resolve node by ID using snapshot (O(1)) or store query
  const resolveNode = (id: string): GraphNode | null => {
    if (snapshotNodeById) {
      return snapshotNodeById.get(id) ?? null
    }
    return store.getNodeById(id)
  }

  const node = resolveNode(nodeId)
  if (!node) {
    log.warn(`buildTaskContext: node ${nodeId} not found`)
    return null
  }

  // Parent
  let parent: TaskSummary | null = null
  if (node.parentId) {
    const parentNode = resolveNode(node.parentId)
    if (parentNode) parent = toTaskSummary(parentNode)
  }

  // Children — from snapshot or store
  let childNodes: GraphNode[]
  if (snapshot) {
    childNodes = []
    for (const nVar of snapshot.nodes) {
      if (nVar.parentId === nodeId) childNodes.push(nVar)
    }
  } else {
    childNodes = store.getChildNodes(nodeId)
  }
  const children = childNodes.map(toTaskSummary)

  // Incoming/outgoing edges — from snapshot or store
  let incomingEdges: GraphEdge[]
  let outgoingEdges: GraphEdge[]
  if (snapshot) {
    incomingEdges = []
    outgoingEdges = []
    for (const e of snapshot.edges) {
      if (e.to === nodeId) incomingEdges.push(e)
      if (e.from === nodeId) outgoingEdges.push(e)
    }
  } else {
    incomingEdges = store.getEdgesTo(nodeId)
    outgoingEdges = store.getEdgesFrom(nodeId)
  }

  const blockers: BlockerInfo[] = []
  const dependsOn: DependencyInfo[] = []
  const relatedIds = new Set<string>()
  const relatedNodes: TaskSummary[] = []
  const implementsNodes: TaskSummary[] = []
  const derivedFromNodes: TaskSummary[] = []
  let edgeParent: TaskSummary | null = null
  const edgeChildren: TaskSummary[] = []
  const edgeChildrenIds = new Set<string>()

  // Edges where something blocks this node: edge.relationType === "blocks" AND edge.to === nodeId
  for (const edge of incomingEdges) {
    if (edge.relationType === 'blocks') {
      const blockerNode = resolveNode(edge.from)
      if (blockerNode) {
        blockers.push({
          id: blockerNode.id,
          title: blockerNode.title,
          status: blockerNode.status,
          relationType: edge.relationType,
          inferred: isInferred(edge),
        })
      }
    } else if (edge.relationType === 'related_to') {
      const relNode = resolveNode(edge.from)
      if (relNode && !relatedIds.has(relNode.id)) {
        relatedIds.add(relNode.id)
        relatedNodes.push(toTaskSummary(relNode))
      }
    } else if (edge.relationType === 'parent_of' && !edgeParent) {
      const parentNode = resolveNode(edge.from)
      if (parentNode) edgeParent = toTaskSummary(parentNode)
    }
  }

  // Edges where this node depends_on something: edge.relationType === "depends_on" AND edge.from === nodeId
  for (const edge of outgoingEdges) {
    if (edge.relationType === 'depends_on') {
      const depNode = resolveNode(edge.to)
      if (depNode) {
        dependsOn.push({
          id: depNode.id,
          title: depNode.title,
          status: depNode.status,
          resolved: depNode.status === 'done',
          inferred: isInferred(edge),
        })
      }
    } else if (edge.relationType === 'related_to') {
      const relNode = resolveNode(edge.to)
      if (relNode && !relatedIds.has(relNode.id)) {
        relatedIds.add(relNode.id)
        relatedNodes.push(toTaskSummary(relNode))
      }
    } else if (edge.relationType === 'implements') {
      const implNode = resolveNode(edge.to)
      if (implNode) implementsNodes.push(toTaskSummary(implNode))
    } else if (edge.relationType === 'derived_from') {
      const derivedNode = resolveNode(edge.to)
      if (derivedNode) derivedFromNodes.push(toTaskSummary(derivedNode))
    } else if (edge.relationType === 'parent_of') {
      const childNode = resolveNode(edge.to)
      if (childNode && !edgeChildrenIds.has(childNode.id)) {
        edgeChildrenIds.add(childNode.id)
        edgeChildren.push(toTaskSummary(childNode))
      }
    }
  }

  // Acceptance criteria (inline + child AC nodes) — targeted queries, no full graph scan
  const acceptanceCriteria = getNodeAcFromStore(store, node.id)

  // Source reference
  const sourceRef: SourceRefInfo | null = node.sourceRef ? { ...node.sourceRef } : null

  // Metrics: estimate original size from local data already loaded (node + children + deps)
  const localNodes = [node, ...childNodes]
  const originalChars =
    localNodes.reduce(
      (sum, n) => sum + n.title.length + (n.description?.length ?? 0) + (n.acceptanceCriteria?.join('').length ?? 0),
      0,
    ) + [...incomingEdges, ...outgoingEdges].reduce((sum, e) => sum + (e.reason?.length ?? 0), 0)

  const summary = toTaskSummary(node)
  // Build payload without 'node' alias for accurate metrics calculation
  const corePayload = {
    task: summary,
    parent,
    children,
    blockers,
    dependsOn,
    relatedNodes: relatedNodes.length > 0 ? relatedNodes : undefined,
    implementsNodes: implementsNodes.length > 0 ? implementsNodes : undefined,
    derivedFromNodes: derivedFromNodes.length > 0 ? derivedFromNodes : undefined,
    edgeParent: edgeParent ?? undefined,
    edgeChildren: edgeChildren.length > 0 ? edgeChildren : undefined,
    acceptanceCriteria,
    sourceRef,
    metrics: { originalChars: 0, compactChars: 0, reductionPercent: 0, estimatedTokens: 0 },
  }

  const compactJson = JSON.stringify(corePayload)
  const compactChars = compactJson.length
  // Bug #034: negative values indicate expansion (JSON overhead > raw text).
  // This is expected for small nodes where structure metadata exceeds original content.
  const reductionPercent = originalChars > 0 ? Math.round(((originalChars - compactChars) / originalChars) * 100) : 0

  const metrics = {
    originalChars,
    compactChars,
    reductionPercent,
    estimatedTokens: estimateTokens(compactJson),
  }

  // Bug #035: assemble final payload with 'node' alias (same reference as 'task')
  const baseCtx: TaskContext = {
    ...corePayload,
    node: summary,
    metrics,
  }
  // Derived next-action verdict (pure, no extra query) — additive optional field.
  const contextPayload: TaskContext = { ...baseCtx, nextAction: deriveNextAction(baseCtx) }

  log.info(`Context for ${nodeId}: ${metrics.estimatedTokens} tokens, ${metrics.reductionPercent}% reduction`)

  emitContextHook('post_context_build', {
    nodeId,
    estimatedTokens: metrics.estimatedTokens,
    reductionPercent: metrics.reductionPercent,
  })
  return contextPayload
}
