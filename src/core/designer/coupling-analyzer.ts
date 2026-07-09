/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Coupling analysis: fan-in, fan-out, instability (Robert C. Martin), isolation detection.
 */

import type { GraphDocument } from '../graph/graph-types.js'
import type { CouplingReport, NodeCouplingMetrics } from '../../schemas/designer-schema.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'coupling-analyzer.ts' })

function calculateDepth(nodeId: string, parentMap: Map<string, string | null | undefined>): number {
  let depth = 0
  let current = parentMap.get(nodeId)
  while (current) {
    depth++
    current = parentMap.get(current)
  }
  return depth
}

/** Compute fan-in, fan-out, and instability for all nodes. */
export function analyzeCoupling(doc: GraphDocument): CouplingReport {
  const { nodes, edges } = doc

  if (nodes.length === 0) {
    return { nodes: [], highCouplingNodes: [], isolatedNodes: [], avgFanIn: 0, avgFanOut: 0, avgInstability: 0 }
  }

  const fanInMap = new Map<string, number>()
  const fanOutMap = new Map<string, number>()
  const parentMap = new Map<string, string | null | undefined>()

  for (const node of nodes) {
    fanInMap.set(node.id, 0)
    fanOutMap.set(node.id, 0)
    parentMap.set(node.id, node.parentId)
  }

  // Bug #029: include parent_of/child_of — in execution graphs, structural edges represent real coupling
  const COUPLING_EDGE_TYPES = new Set([
    'depends_on',
    'blocks',
    'related_to',
    'implements',
    'derived_from',
    'priority_over',
    'parent_of',
    'child_of',
  ])

  for (const edge of edges) {
    if (!COUPLING_EDGE_TYPES.has(edge.relationType)) continue
    // from → to: from has fanOut, to has fanIn
    fanOutMap.set(edge.from, (fanOutMap.get(edge.from) ?? 0) + 1)
    fanInMap.set(edge.to, (fanInMap.get(edge.to) ?? 0) + 1)
  }

  const metrics: NodeCouplingMetrics[] = nodes.map((node) => {
    const fanIn = fanInMap.get(node.id) ?? 0
    const fanOut = fanOutMap.get(node.id) ?? 0
    const total = fanIn + fanOut
    const instability = total > 0 ? fanOut / total : 0
    const depth = calculateDepth(node.id, parentMap)

    return { nodeId: node.id, fanIn, fanOut, depth, instability }
  })

  const HIGH_COUPLING_THRESHOLD = 5
  const highCouplingNodes = metrics.filter((m) => m.fanIn + m.fanOut > HIGH_COUPLING_THRESHOLD).map((m) => m.nodeId)

  // Isolated: no edges AND has a parentId (root/top-level nodes without edges are expected)
  const isolatedNodes = metrics
    .filter((m) => {
      if (m.fanIn + m.fanOut !== 0) return false
      const node = nodes.find((n) => n.id === m.nodeId)
      return !!node?.parentId
    })
    .map((m) => m.nodeId)

  const avgFanIn = metrics.reduce((sum, m) => sum + m.fanIn, 0) / metrics.length
  const avgFanOut = metrics.reduce((sum, m) => sum + m.fanOut, 0) / metrics.length
  const avgInstability = metrics.reduce((sum, m) => sum + m.instability, 0) / metrics.length

  log.info('coupling-analyzer', {
    nodeCount: metrics.length,
    highCoupling: highCouplingNodes.length,
    isolated: isolatedNodes.length,
  })

  return { nodes: metrics, highCouplingNodes, isolatedNodes, avgFanIn, avgFanOut, avgInstability }
}
