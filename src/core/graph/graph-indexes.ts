/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import type { GraphNode, GraphEdge, GraphIndexes } from './graph-types.js'

/** Build lookup indexes (by-id, children-by-parent, incoming/outgoing edges) for fast graph traversal. */
export function buildIndexes(nodes: GraphNode[], edges: GraphEdge[]): GraphIndexes {
  const byId: Record<string, number> = {}
  const childrenByParent: Record<string, string[]> = {}
  const incomingByNode: Record<string, string[]> = {}
  const outgoingByNode: Record<string, string[]> = {}

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    byId[node.id] = i

    if (node.parentId) {
      if (!childrenByParent[node.parentId]) {
        childrenByParent[node.parentId] = []
      }
      childrenByParent[node.parentId].push(node.id)
    }
  }

  for (const edge of edges) {
    if (!outgoingByNode[edge.from]) {
      outgoingByNode[edge.from] = []
    }
    outgoingByNode[edge.from].push(edge.id)

    if (!incomingByNode[edge.to]) {
      incomingByNode[edge.to] = []
    }
    incomingByNode[edge.to].push(edge.id)
  }

  return { byId, childrenByParent, incomingByNode, outgoingByNode }
}
