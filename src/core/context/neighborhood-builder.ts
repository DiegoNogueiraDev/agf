/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Builds a full (uncompressed) neighborhood for baseline token metrics.
 * WHY: isolated from compressed builder so the honest baseline can be read
 * independently. Composing: compact-context-types.ts (NaiveNeighborhood),
 * token-estimator.ts.
 */

import type { SqliteStore } from '../store/sqlite-store.js'
import type { GraphNode } from '../graph/graph-types.js'
import type { NaiveNeighborhood } from './compact-context-types.js'
import { estimateTokens } from './token-estimator.js'

/** Build a full (uncompressed) neighborhood for baseline metrics. */
export function buildNaiveNeighborhood(store: SqliteStore, nodeId: string): NaiveNeighborhood | null {
  const node = store.getNodeById(nodeId)
  if (!node) return null

  // Parent
  let parent: GraphNode | null = null
  if (node.parentId) {
    const parentNode = store.getNodeById(node.parentId)
    if (parentNode) parent = parentNode
  }

  // Children
  const children = store.getChildNodes(nodeId)

  // Edges — same logic as buildTaskContext but returning full GraphNode
  const incomingEdges = store.getEdgesTo(nodeId)
  const outgoingEdges = store.getEdgesFrom(nodeId)

  const blockers: GraphNode[] = []
  const dependsOn: GraphNode[] = []
  const relatedIds = new Set<string>()
  const relatedNodes: GraphNode[] = []
  const implementsNodes: GraphNode[] = []
  const derivedFromNodes: GraphNode[] = []
  let edgeParent: GraphNode | null = null
  const edgeChildren: GraphNode[] = []
  const edgeChildrenIds = new Set<string>()

  for (const edge of incomingEdges) {
    if (edge.relationType === 'blocks') {
      const blockerNode = store.getNodeById(edge.from)
      if (blockerNode) blockers.push(blockerNode)
    } else if (edge.relationType === 'related_to') {
      const relNode = store.getNodeById(edge.from)
      if (relNode && !relatedIds.has(relNode.id)) {
        relatedIds.add(relNode.id)
        relatedNodes.push(relNode)
      }
    } else if (edge.relationType === 'parent_of' && !edgeParent) {
      const pNode = store.getNodeById(edge.from)
      if (pNode) edgeParent = pNode
    }
  }

  for (const edge of outgoingEdges) {
    if (edge.relationType === 'depends_on') {
      const depNode = store.getNodeById(edge.to)
      if (depNode) dependsOn.push(depNode)
    } else if (edge.relationType === 'related_to') {
      const relNode = store.getNodeById(edge.to)
      if (relNode && !relatedIds.has(relNode.id)) {
        relatedIds.add(relNode.id)
        relatedNodes.push(relNode)
      }
    } else if (edge.relationType === 'implements') {
      const implNode = store.getNodeById(edge.to)
      if (implNode) implementsNodes.push(implNode)
    } else if (edge.relationType === 'derived_from') {
      const derivedNode = store.getNodeById(edge.to)
      if (derivedNode) derivedFromNodes.push(derivedNode)
    } else if (edge.relationType === 'parent_of') {
      const cNode = store.getNodeById(edge.to)
      if (cNode && !edgeChildrenIds.has(cNode.id)) {
        edgeChildrenIds.add(cNode.id)
        edgeChildren.push(cNode)
      }
    }
  }

  const payload: Record<string, unknown> = {
    task: node,
    parent,
    children,
    blockers,
    dependsOn,
    acceptanceCriteria: node.acceptanceCriteria ?? [],
    sourceRef: node.sourceRef ?? null,
  }
  if (relatedNodes.length > 0) payload['relatedNodes'] = relatedNodes
  if (implementsNodes.length > 0) payload['implementsNodes'] = implementsNodes
  if (derivedFromNodes.length > 0) payload['derivedFromNodes'] = derivedFromNodes
  if (edgeParent) payload['edgeParent'] = edgeParent
  if (edgeChildren.length > 0) payload['edgeChildren'] = edgeChildren

  const estimatedTokensValue = estimateTokens(JSON.stringify(payload))

  return {
    task: node,
    parent,
    children,
    blockers,
    dependsOn,
    estimatedTokens: estimatedTokensValue,
  }
}
