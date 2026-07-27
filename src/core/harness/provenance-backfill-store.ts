/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * applyProvenanceBackfill — DB-side wrapper around computeProvenanceBackfill.
 *
 * Loads the node + parent_of edge snapshot, runs the pure cascade, and
 * persists each update inside a single transaction. The inherited
 * source_file is also recorded in `metadata.provenance.inherited_from`
 * so future audits can distinguish original vs cascaded receipts.
 */

import type Database from 'better-sqlite3'
import { computeProvenanceBackfill, type BackfillNode, type BackfillEdge } from './provenance-backfill.js'

export interface BackfillSummary {
  scanned: number
  updated: number
}

/** applyProvenanceBackfill —  */
export function applyProvenanceBackfill(db: Database.Database): BackfillSummary {
  const nodeRows = db.prepare('SELECT id, source_file, metadata FROM nodes').all() as ReadonlyArray<{
    id: string
    source_file: string | null
    metadata: string | null
  }>

  const edgeRows = db
    .prepare("SELECT from_node, to_node, relation_type FROM edges WHERE relation_type = 'parent_of'")
    .all() as ReadonlyArray<{ from_node: string; to_node: string; relation_type: string }>

  const nodes: BackfillNode[] = nodeRows.map((row) => ({
    id: row.id,
    sourceFile: row.source_file,
  }))

  const edges: BackfillEdge[] = edgeRows.map((row) => ({
    fromNode: row.from_node,
    toNode: row.to_node,
    relationType: row.relation_type,
  }))

  const updates = computeProvenanceBackfill({ nodes, edges })

  if (updates.length === 0) {
    return { scanned: nodeRows.length, updated: 0 }
  }

  const metadataById = new Map<string, string | null>()
  for (const row of nodeRows) metadataById.set(row.id, row.metadata)

  const updateStmt = db.prepare('UPDATE nodes SET source_file = ?, metadata = ?, updated_at = ? WHERE id = ?')
  const now = new Date().toISOString()

  const tx = db.transaction(() => {
    for (const update of updates) {
      const raw = metadataById.get(update.nodeId) ?? '{}'
      const merged = mergeProvenance(raw, update.inheritedFrom)
      updateStmt.run(update.sourceFile, merged, now, update.nodeId)
    }
  })
  tx()

  return { scanned: nodeRows.length, updated: updates.length }
}

function mergeProvenance(rawMetadata: string, inheritedFrom: string): string {
  let parsed: Record<string, unknown> = {}
  if (rawMetadata && rawMetadata.trim() !== '') {
    try {
      const candidate = JSON.parse(rawMetadata) as unknown
      if (candidate && typeof candidate === 'object') {
        parsed = candidate as Record<string, unknown>
      }
    } catch {
      // Corrupt metadata — start fresh; we still preserve the inherited_from receipt.
      parsed = {}
    }
  }

  const existingProvenance =
    typeof parsed.provenance === 'object' && parsed.provenance !== null
      ? (parsed.provenance as Record<string, unknown>)
      : {}

  parsed.provenance = {
    ...existingProvenance,
    inherited_from: inheritedFrom,
  }
  return JSON.stringify(parsed)
}
