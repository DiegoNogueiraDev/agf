/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Interface-first checker: validates that contract nodes have description, AC, edges, and constraint links.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { InterfaceReport, InterfaceCheckResult } from '../../schemas/designer-schema.js'
import { nodeHasAc } from '../utils/ac-helpers.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'interface-checker.ts' })

// Bug #071: include constraint and risk nodes in interface analysis
const INTERFACE_NODE_TYPES = new Set(['epic', 'requirement', 'decision', 'constraint', 'risk'])

/** Validate contract nodes have description, AC, edges, and links. */
export function checkInterfaces(doc: GraphDocument): InterfaceReport {
  const { nodes, edges } = doc
  const interfaceNodes = nodes.filter((n) => INTERFACE_NODE_TYPES.has(n.type))

  if (interfaceNodes.length === 0) {
    return { results: [], overallScore: 100, nodesWithoutContracts: [] }
  }

  const constraintIds = new Set(nodes.filter((n) => n.type === 'constraint').map((n) => n.id))

  // Build node-to-edges map
  const nodeEdges = new Map<string, Set<string>>()
  const nodeConstraintLinks = new Map<string, boolean>()

  for (const edge of edges) {
    // Track edges for both from and to
    const fromSet = nodeEdges.get(edge.from) ?? new Set<string>()
    fromSet.add(edge.to)
    nodeEdges.set(edge.from, fromSet)

    const toSet = nodeEdges.get(edge.to) ?? new Set<string>()
    toSet.add(edge.from)
    nodeEdges.set(edge.to, toSet)

    // Track constraint links
    if (constraintIds.has(edge.to)) {
      nodeConstraintLinks.set(edge.from, true)
    }
    if (constraintIds.has(edge.from)) {
      nodeConstraintLinks.set(edge.to, true)
    }
  }

  const results: InterfaceCheckResult[] = interfaceNodes.map((node) => {
    const hasDescription = !!node.description && node.description.trim().length > 0
    const hasAC = nodeHasAc(doc, node.id)
    const hasEdges = (nodeEdges.get(node.id)?.size ?? 0) > 0
    const hasConstraintLink = nodeConstraintLinks.get(node.id) ?? false

    let score = 0
    if (hasDescription) score += 25
    if (hasAC) score += 25
    if (hasEdges) score += 25
    if (hasConstraintLink) score += 25

    return { nodeId: node.id, hasDescription, hasAC, hasEdges, hasConstraintLink, score }
  })

  const overallScore = Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
  const nodesWithoutContracts = results.filter((r) => r.score < 50).map((r) => r.nodeId)

  log.info('interface-checker', { evaluated: results.length, overallScore })

  return { results, overallScore, nodesWithoutContracts }
}
