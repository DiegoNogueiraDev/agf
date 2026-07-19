/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * provenance-backfill — propagate `source_file` from ancestor to descendant
 * along `parent_of` edges. Pure compute: takes a node + edge snapshot and
 * returns the list of updates needed.
 *
 * Default depth cap = 6 — deep chains are usually a smell, and an unbounded
 * walk would amplify a misclassified ancestor across many descendants.
 */

export interface BackfillNode {
  id: string
  sourceFile: string | null
}

export interface BackfillEdge {
  fromNode: string
  toNode: string
  relationType: string
}

export interface BackfillInput {
  nodes: readonly BackfillNode[]
  edges: readonly BackfillEdge[]
  /** Max parent_of hops to traverse from a child upward. Default 6. */
  maxDepth?: number
}

export interface BackfillUpdate {
  nodeId: string
  sourceFile: string
  /** ID of the ancestor whose source_file was copied. */
  inheritedFrom: string
}

const DEFAULT_MAX_DEPTH = 6

/**
 * For each node missing source_file, walk parent_of edges upward and
 * return the closest ancestor's source_file as the inherited value.
 * Idempotent — nodes already having source_file are skipped.
 */
export function computeProvenanceBackfill(input: BackfillInput): BackfillUpdate[] {
  const maxDepth = input.maxDepth ?? DEFAULT_MAX_DEPTH
  const nodeSourceFile = new Map<string, string | null>()
  for (const node of input.nodes) {
    nodeSourceFile.set(node.id, node.sourceFile)
  }

  // Build child → parent index (only parent_of edges).
  const parentByChild = new Map<string, string>()
  for (const edge of input.edges) {
    if (edge.relationType !== 'parent_of') continue
    parentByChild.set(edge.toNode, edge.fromNode)
  }

  const updates: BackfillUpdate[] = []
  for (const node of input.nodes) {
    if (node.sourceFile && node.sourceFile.trim() !== '') continue
    const ancestor = findClosestSourcedAncestor(node.id, parentByChild, nodeSourceFile, maxDepth)
    if (ancestor !== null) {
      updates.push({
        nodeId: node.id,
        sourceFile: ancestor.sourceFile,
        inheritedFrom: ancestor.id,
      })
    }
  }
  return updates
}

interface AncestorHit {
  id: string
  sourceFile: string
}

function findClosestSourcedAncestor(
  startId: string,
  parentByChild: Map<string, string>,
  nodeSourceFile: Map<string, string | null>,
  maxDepth: number,
): AncestorHit | null {
  let cursor = parentByChild.get(startId)
  let depth = 0
  const seen = new Set<string>([startId])
  while (cursor !== undefined && depth < maxDepth) {
    if (seen.has(cursor)) return null // defensive cycle guard
    seen.add(cursor)
    const sourceFile = nodeSourceFile.get(cursor)
    if (sourceFile && sourceFile.trim() !== '') {
      return { id: cursor, sourceFile }
    }
    cursor = parentByChild.get(cursor)
    depth += 1
  }
  return null
}
