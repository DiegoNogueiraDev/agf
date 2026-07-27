/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Auto-sequence: creates depends_on edges between children of a parent node,
 * ordered by createdAt, so each child depends on the previous one.
 */
import type { SqliteStore } from '../store/sqlite-store.js'
import type { GraphEdge } from './graph-types.js'
import { generateId } from '../utils/id.js'
import { now } from '../utils/time.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'auto-sequence.ts' })

/** sequenceSubtasks —  */
export function sequenceSubtasks(store: SqliteStore, parentId: string): { edgesCreated: number; chain: string[] } {
  const doc = store.toGraphDocument()
  const children = doc.nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  if (children.length < 2) return { edgesCreated: 0, chain: children.map((c) => c.id) }

  const edges: GraphEdge[] = []
  for (let i = 1; i < children.length; i++) {
    const edge: GraphEdge = {
      id: generateId('edge'),
      from: children[i].id,
      to: children[i - 1].id,
      relationType: 'depends_on',
      reason: 'Auto-sequenced by parent',
      createdAt: now(),
    }
    edges.push(edge)
  }

  if (edges.length > 0) {
    store.mergeInsert([], edges)
  }

  log.info('auto-sequence', { parentId, edgesCreated: edges.length })
  return { edgesCreated: edges.length, chain: children.map((c) => c.id) }
}
