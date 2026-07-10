/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * SubtaskArtifactsStore — persistent store for structured subtask outputs
 * consumed by the v11 context-pollination assembly.
 *
 * ADR-0046: dedicated table with (epic_id, created_at) + (node_id) indexes,
 * unique-by (project_id, epic_id, kind, content_hash) for dedup.
 * ADR-0048: content_hash computed via canonicalization to survive whitespace/comment noise.
 */

import type { SqliteStore } from './sqlite-store.js'
import { generateId } from '../utils/id.js'
import { computeContentHash } from '../canonicalization/ts.js'
import { OperationError } from '../utils/errors.js'

export type ArtifactKind = 'diff' | 'file' | 'interface' | 'decision' | 'note'

export interface SubtaskArtifact {
  id: string
  nodeId: string
  epicId: string
  kind: ArtifactKind
  path: string | null
  content: string
  contentHash: string
  createdAt: string
}

export interface SubtaskArtifactInput {
  nodeId: string
  epicId: string
  kind: ArtifactKind
  path?: string | null
  content: string
}

interface ArtifactRow {
  id: string
  project_id: string
  node_id: string
  epic_id: string
  kind: ArtifactKind
  path: string | null
  content: string
  content_hash: string
  created_at: string
}

function rowToArtifact(row: ArtifactRow): SubtaskArtifact {
  return {
    id: row.id,
    nodeId: row.node_id,
    epicId: row.epic_id,
    kind: row.kind,
    path: row.path,
    content: row.content,
    contentHash: row.content_hash,
    createdAt: row.created_at,
  }
}

export class SubtaskArtifactsStore {
  constructor(private readonly store: SqliteStore) {}

  /**
   * Insert an artifact. If an artifact with the same
   * (project_id, epic_id, kind, content_hash) already exists, return its id
   * (dedup — ADR-0046).
   */
  insert(input: SubtaskArtifactInput): string {
    const db = this.store.getDb()
    const projectRow = db.prepare('SELECT id FROM projects LIMIT 1').get() as { id: string } | undefined
    if (!projectRow) {
      throw new OperationError('subtask_artifacts:no_project — call initProject() first')
    }

    const contentHash = computeContentHash(input.content)

    const existing = db
      .prepare(
        `SELECT id FROM subtask_artifacts
         WHERE project_id = ? AND epic_id = ? AND kind = ? AND content_hash = ?`,
      )
      .get(projectRow.id, input.epicId, input.kind, contentHash) as { id: string } | undefined

    if (existing) return existing.id

    const id = generateId('artifact')
    const createdAt = new Date().toISOString()

    db.prepare(
      `INSERT INTO subtask_artifacts
        (id, project_id, node_id, epic_id, kind, path, content, content_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      projectRow.id,
      input.nodeId,
      input.epicId,
      input.kind,
      input.path ?? null,
      input.content,
      contentHash,
      createdAt,
    )

    // Emit subtask_artifact:created event (only for NEW inserts — dedup returns early above)
    const bus = this.store.eventBus
    if (bus) {
      bus.emit({
        type: 'subtask_artifact:created',
        timestamp: createdAt,
        payload: {
          artifactId: id,
          nodeId: input.nodeId,
          epicId: input.epicId,
          kind: input.kind,
          contentHash,
          path: input.path ?? null,
        },
      })
    }

    return id
  }

  /** List artifacts for an epic, ordered by created_at ASC (query-path uses index). */
  listByEpic(epicId: string): SubtaskArtifact[] {
    const rows = this.store
      .getDb()
      .prepare(
        `SELECT * FROM subtask_artifacts
         WHERE epic_id = ?
         ORDER BY created_at ASC, id ASC`,
      )
      .all(epicId) as ArtifactRow[]
    return rows.map(rowToArtifact)
  }

  /** List artifacts for a single node (uses idx_artifacts_node). */
  listByNode(nodeId: string): SubtaskArtifact[] {
    const rows = this.store
      .getDb()
      .prepare(
        `SELECT * FROM subtask_artifacts
         WHERE node_id = ?
         ORDER BY created_at ASC, id ASC`,
      )
      .all(nodeId) as ArtifactRow[]
    return rows.map(rowToArtifact)
  }

  /** Fetch a single artifact by id (or null). */
  getById(id: string): SubtaskArtifact | null {
    const row = this.store.getDb().prepare('SELECT * FROM subtask_artifacts WHERE id = ?').get(id) as
      ArtifactRow | undefined
    return row ? rowToArtifact(row) : null
  }
}
