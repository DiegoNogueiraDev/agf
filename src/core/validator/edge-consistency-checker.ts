/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Edge Consistency Checker — validates that edge relation names are consistent
 * with their direction semantics.
 *
 * Checks performed:
 * - self_loop: edge from === to
 * - redundant_inverse: depends_on A→B co-exists with blocks B→A (semantic duplicate)
 * - orphan_parent_of: parent_of edge with no matching child_of inverse
 * - orphan_child_of: child_of edge with no matching parent_of inverse
 * - parent_child_mismatch: parent_of A→B where child node parentId contradicts A
 */

import type { GraphDocument, GraphEdge } from '../graph/graph-types.js'
import type { EdgeConsistencyIssue, EdgeConsistencyReport } from '../../schemas/validator-schema.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'edge-consistency-checker.ts' })

/** Return canonical key for a node pair, direction-independent. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** Check all edge consistency rules against the graph document. */
export function checkEdgeConsistency(doc: GraphDocument): EdgeConsistencyReport {
  const issues: EdgeConsistencyIssue[] = []

  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]))

  // Index edges by (from, to, relationType) for fast lookup
  const edgeIndex = new Map<string, GraphEdge>()
  for (const edge of doc.edges) {
    edgeIndex.set(`${edge.from}|${edge.to}|${edge.relationType}`, edge)
  }

  // Track detected redundant pairs to avoid duplicate issue reports
  const reportedPairs = new Set<string>()

  for (const edge of doc.edges) {
    // 1. Self-loop
    if (edge.from === edge.to) {
      issues.push({
        edgeId: edge.id,
        issueType: 'self_loop',
        details: `Edge "${edge.id}" (${edge.relationType}) points from node "${edge.from}" to itself`,
        involvedNodes: [edge.from],
      })
      continue
    }

    // 2. Redundant inverse: depends_on A→B paired with blocks B→A
    if (edge.relationType === 'depends_on') {
      const inverseKey = `${edge.to}|${edge.from}|blocks`
      const inverseEdge = edgeIndex.get(inverseKey)
      if (inverseEdge) {
        const key = pairKey(edge.from, edge.to)
        if (!reportedPairs.has(`redundant|${key}`)) {
          reportedPairs.add(`redundant|${key}`)
          issues.push({
            edgeId: edge.id,
            issueType: 'redundant_inverse',
            details: `"depends_on ${edge.from}→${edge.to}" is semantically equivalent to "blocks ${edge.to}→${edge.from}" (edge "${inverseEdge.id}") — redundant pair`,
            involvedNodes: [edge.from, edge.to],
          })
        }
      }
    }

    // 3. orphan_parent_of: parent_of with no matching child_of inverse
    if (edge.relationType === 'parent_of') {
      const inverseKey = `${edge.to}|${edge.from}|child_of`
      if (!edgeIndex.has(inverseKey)) {
        issues.push({
          edgeId: edge.id,
          issueType: 'orphan_parent_of',
          details: `Edge "${edge.id}" parent_of ${edge.from}→${edge.to} has no matching child_of ${edge.to}→${edge.from}`,
          involvedNodes: [edge.from, edge.to],
        })
      } else {
        // 4. parent_child_mismatch: parent_of A→B but child B.parentId !== A
        const childNode = nodeById.get(edge.to)
        if (childNode && childNode.parentId != null && childNode.parentId !== edge.from) {
          issues.push({
            edgeId: edge.id,
            issueType: 'parent_child_mismatch',
            details: `Edge "${edge.id}" claims ${edge.from} is parent of ${edge.to}, but node "${edge.to}" has parentId="${childNode.parentId}"`,
            involvedNodes: [edge.from, edge.to],
          })
        }
      }
    }

    // 5. orphan_child_of: child_of with no matching parent_of inverse
    if (edge.relationType === 'child_of') {
      const inverseKey = `${edge.to}|${edge.from}|parent_of`
      if (!edgeIndex.has(inverseKey)) {
        issues.push({
          edgeId: edge.id,
          issueType: 'orphan_child_of',
          details: `Edge "${edge.id}" child_of ${edge.from}→${edge.to} has no matching parent_of ${edge.to}→${edge.from}`,
          involvedNodes: [edge.from, edge.to],
        })
      }
    }
  }

  const passed = issues.length === 0
  log.info('edge-consistency-check', { passed, issueCount: issues.length, edgeCount: doc.edges.length })

  return { issues, passed }
}
