/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Pure hierarchy utility functions for graph node expand/collapse.
 * No React/DOM dependencies — fully testable.
 */

import type { GraphNode, GraphEdge } from './types'

export interface HierarchyTreeNode {
  node: GraphNode
  children: HierarchyTreeNode[]
}

/**
 * Build a map of parentId → childIds, combining parentId from nodes
 * and parent_of/child_of edges. Deduplicates children.
 */
export function buildChildrenMap(nodes: GraphNode[], edges: GraphEdge[]): Map<string, string[]> {
  const childrenSets = new Map<string, Set<string>>()

  const addChild = (parentId: string, childId: string): void => {
    let set = childrenSets.get(parentId)
    if (!set) {
      set = new Set()
      childrenSets.set(parentId, set)
    }
    set.add(childId)
  }

  // From parentId field
  for (const node of nodes) {
    if (node.parentId) {
      addChild(node.parentId, node.id)
    }
  }

  // From parent_of edges
  for (const edge of edges) {
    if (edge.relationType === 'parent_of') {
      addChild(edge.from, edge.to)
    } else if (edge.relationType === 'child_of') {
      addChild(edge.to, edge.from)
    }
  }

  // Convert Sets to arrays
  const result = new Map<string, string[]>()
  for (const [parentId, childSet] of childrenSets) {
    result.set(parentId, [...childSet])
  }
  return result
}

/**
 * Return nodes that have no parentId (roots of the hierarchy).
 */
export function getRootNodes(nodes: GraphNode[]): GraphNode[] {
  return nodes.filter((n) => !n.parentId)
}

/**
 * Compute visible nodes based on which nodes are expanded.
 * Starts with root nodes, then includes direct children of expanded nodes recursively.
 * Orphan nodes (parentId pointing to non-existent node) appear as roots.
 */
export function getVisibleNodes(
  allNodes: GraphNode[],
  expandedIds: Set<string>,
  childrenMap: Map<string, string[]>,
): GraphNode[] {
  const nodeMap = new Map<string, GraphNode>()
  const nodeIdSet = new Set<string>()
  for (const n of allNodes) {
    nodeMap.set(n.id, n)
    nodeIdSet.add(n.id)
  }

  // Root nodes: no parentId, OR parentId not in the node set (orphan)
  const roots = allNodes.filter((n) => !n.parentId || !nodeIdSet.has(n.parentId))

  const visible: GraphNode[] = []
  const visited = new Set<string>()

  const collect = (nodeId: string): void => {
    if (visited.has(nodeId)) return // guard against cycles
    visited.add(nodeId)

    const node = nodeMap.get(nodeId)
    if (node) visible.push(node)

    if (expandedIds.has(nodeId)) {
      const children = childrenMap.get(nodeId) ?? []
      for (const childId of children) {
        collect(childId)
      }
    }
  }

  for (const root of roots) {
    collect(root.id)
  }

  return visible
}

/**
 * Build a full hierarchy tree for the sidebar.
 * Orphan nodes (parentId pointing to non-existent node) appear at root level.
 */
export function buildHierarchyTree(nodes: GraphNode[], childrenMap: Map<string, string[]>): HierarchyTreeNode[] {
  if (nodes.length === 0) return []

  const nodeMap = new Map<string, GraphNode>()
  const nodeIdSet = new Set<string>()
  for (const n of nodes) {
    nodeMap.set(n.id, n)
    nodeIdSet.add(n.id)
  }

  const buildSubtree = (nodeId: string, visited: Set<string>): HierarchyTreeNode | null => {
    if (visited.has(nodeId)) return null // guard against cycles
    visited.add(nodeId)

    const node = nodeMap.get(nodeId)
    if (!node) return null

    const childIds = childrenMap.get(nodeId) ?? []
    const children: HierarchyTreeNode[] = []
    for (const childId of childIds) {
      const child = buildSubtree(childId, visited)
      if (child) children.push(child)
    }

    return { node, children }
  }

  // Roots: no parentId, or parentId not in node set
  const roots = nodes.filter((n) => !n.parentId || !nodeIdSet.has(n.parentId))

  const visited = new Set<string>()
  const tree: HierarchyTreeNode[] = []
  for (const root of roots) {
    const subtree = buildSubtree(root.id, visited)
    if (subtree) tree.push(subtree)
  }

  return tree
}

/**
 * Check if a node has expandable children.
 */
export function hasExpandableChildren(nodeId: string, childrenMap: Map<string, string[]>): boolean {
  const children = childrenMap.get(nodeId)
  return children != null && children.length > 0
}

/**
 * Get the number of direct children for a node.
 */
export function getChildCount(nodeId: string, childrenMap: Map<string, string[]>): number {
  return childrenMap.get(nodeId)?.length ?? 0
}
