/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { z } from 'zod/v4'
import type { SqliteStore } from '../store/sqlite-store.js'
import type { GraphDocument, GraphNode } from '../graph/graph-types.js'
import { GraphDocumentSchema } from '../../schemas/graph.schema.js'
import { ValidationError } from '../utils/errors.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'import-graph.ts' })

export interface MergeGraphOptions {
  dryRun?: boolean
}

export interface MergeGraphResult {
  nodesInserted: number
  nodesSkipped: number
  edgesInserted: number
  edgesSkipped: number
  edgesOrphaned: number
  sourceProject: string
}

/**
 * Merge an exported GraphDocument into the local store without overriding existing data.
 *
 * - Nodes with IDs already present locally are SKIPPED (local version wins).
 * - Edges with the same (from, to, relationType) are SKIPPED via INSERT OR IGNORE.
 * - Edges referencing nodes that don't exist (locally or in the import) are SKIPPED as orphans.
 * - In dryRun mode, no data is written; only counts are returned.
 */
/** Merge an exported graph into the local store (skip duplicates). */
export function mergeGraph(store: SqliteStore, incoming: GraphDocument, options?: MergeGraphOptions): MergeGraphResult {
  // 1. Validate incoming document
  try {
    GraphDocumentSchema.parse(incoming)
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new ValidationError('Invalid graph document', err.issues)
    }
    throw err
  }

  const sourceProject = incoming.project.name
  const dryRun = options?.dryRun ?? false

  log.info('merge-graph:start', {
    sourceProject,
    incomingNodes: incoming.nodes.length,
    incomingEdges: incoming.edges.length,
    dryRun,
  })

  // 2. Collect existing node IDs
  const existingNodes = store.getAllNodes()
  const existingNodeIds = new Set(existingNodes.map((n) => n.id))

  // 3. Partition incoming nodes
  const nodesToInsert: GraphNode[] = []
  let nodesSkipped = 0

  for (const node of incoming.nodes) {
    if (existingNodeIds.has(node.id)) {
      nodesSkipped++
    } else {
      // Tag with merge origin metadata
      const taggedNode: GraphNode = {
        ...node,
        metadata: {
          ...node.metadata,
          mergedFrom: sourceProject,
        },
      }
      nodesToInsert.push(taggedNode)
    }
  }

  // 4. Build set of all available node IDs (existing + to-be-inserted)
  const availableNodeIds = new Set(existingNodeIds)
  for (const node of nodesToInsert) {
    availableNodeIds.add(node.id)
  }

  // 5. Filter edges: keep only those where both from and to exist
  const validEdges = []
  let edgesOrphaned = 0

  for (const edge of incoming.edges) {
    if (availableNodeIds.has(edge.from) && availableNodeIds.has(edge.to)) {
      validEdges.push(edge)
    } else {
      edgesOrphaned++
    }
  }

  // 6. In dry-run mode, estimate edge skips without writing
  if (dryRun) {
    // We can't know exact edge skip counts without trying INSERT OR IGNORE,
    // but we can count edges whose (from, to, relationType) match existing edges
    const existingEdges = store.getAllEdges()
    const existingEdgeKeys = new Set(existingEdges.map((e) => `${e.from}|${e.to}|${e.relationType}`))
    let edgesInserted = 0
    let edgesSkipped = 0
    for (const edge of validEdges) {
      const key = `${edge.from}|${edge.to}|${edge.relationType}`
      if (existingEdgeKeys.has(key)) {
        edgesSkipped++
      } else {
        edgesInserted++
      }
    }

    log.info('merge-graph:dry-run', {
      nodesInserted: nodesToInsert.length,
      nodesSkipped,
      edgesInserted,
      edgesSkipped,
      edgesOrphaned,
    })

    return {
      nodesInserted: nodesToInsert.length,
      nodesSkipped,
      edgesInserted,
      edgesSkipped,
      edgesOrphaned,
      sourceProject,
    }
  }

  // 7. Create snapshot before merge (safety net)
  store.createSnapshot()

  // 8. Perform merge insert
  const { nodesInserted, edgesInserted } = store.mergeInsert(nodesToInsert, validEdges)
  const edgesSkipped = validEdges.length - edgesInserted

  // 9. Record import
  store.recordImport(`merge:${sourceProject}`, nodesInserted, edgesInserted)

  log.info('merge-graph:done', {
    sourceProject,
    nodesInserted,
    nodesSkipped,
    edgesInserted,
    edgesSkipped,
    edgesOrphaned,
  })

  return {
    nodesInserted,
    nodesSkipped,
    edgesInserted,
    edgesSkipped,
    edgesOrphaned,
    sourceProject,
  }
}
