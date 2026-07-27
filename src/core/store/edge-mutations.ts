/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Edge CRUD operations, extracted from sqlite-store.ts.
 *
 * WHY here: edge methods are a cohesive group (~90 lines); keeping them
 * separate from NodeOps mirrors the node/edge domain split and reduces
 * sqlite-store.ts below 800 lines. EdgeOps is wired up by SqliteStore
 * via constructor injection — no import of SqliteStore here.
 *
 * Composing modules: depends on sqlite-converters.ts for EdgeRow/edgeToRow/
 * rowToEdge and ACTIVE_NODE_PREDICATE. SqliteStore creates one EdgeOps
 * instance and delegates the public edge methods to it.
 */

import type Database from 'better-sqlite3'
import type { GraphEdge } from '../graph/graph-types.js'
import type { GraphEventBus } from '../events/event-bus.js'
import { createLogger } from '../utils/logger.js'
import { ValidationError } from '../utils/errors.js'
import { GraphEdgeSchema } from '../../schemas/edge.schema.js'
import { z } from 'zod/v4'
import {
  type EdgeRow,
  edgeToRow,
  rowToEdge,
  ACTIVE_NODE_PREDICATE,
  ACTIVE_EDGE_ENDPOINTS_PREDICATE,
} from './sqlite-converters.js'

const log = createLogger({ layer: 'core', source: 'edge-mutations.ts' })

/**
 * All edge-level CRUD operations for the graph store.
 * Receives db, getStmt, ensureProject, and getEventBus via constructor injection.
 */
export class EdgeOps {
  constructor(
    private readonly db: Database.Database,
    private readonly getStmt: (sql: string) => Database.Statement,
    private readonly ensureProject: () => string,
    private readonly getEventBus: () => GraphEventBus | null,
  ) {}

  deleteEdge(id: string): boolean {
    const pid = this.ensureProject()
    const resultValue = this.db.prepare('DELETE FROM edges WHERE id = ? AND project_id = ?').run(id, pid)
    const deleted = resultValue.changes > 0
    if (deleted) this.getEventBus()?.emitTyped('edge:deleted', { edgeId: id })
    return deleted
  }

  insertEdge(edge: GraphEdge): void {
    try {
      GraphEdgeSchema.parse(edge)
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new ValidationError('Invalid edge', err.issues)
      }
      throw err
    }
    const pid = this.ensureProject()
    // Bug #E4-T02: check node existence inside transaction to prevent TOCTOU
    const inserted = this.db.transaction(() => {
      // AUDIT-011: an archived endpoint must not anchor a new edge (would be dangling).
      const fromExists = this.db
        .prepare(`SELECT 1 FROM nodes WHERE id = ? AND project_id = ? AND ${ACTIVE_NODE_PREDICATE}`)
        .get(edge.from, pid)
      const toExists = this.db
        .prepare(`SELECT 1 FROM nodes WHERE id = ? AND project_id = ? AND ${ACTIVE_NODE_PREDICATE}`)
        .get(edge.to, pid)
      if (!fromExists || !toExists) {
        log.debug('edge:insert:skipped:missing-node', {
          edgeId: edge.id,
          from: edge.from,
          to: edge.to,
          fromExists: !!fromExists,
          toExists: !!toExists,
        })
        return false
      }
      const row = edgeToRow(edge, pid)
      this.db
        .prepare(
          `INSERT OR IGNORE INTO edges
            (id, project_id, from_node, to_node, relation_type, weight, reason, metadata, created_at)
           VALUES
            (@id, @project_id, @from_node, @to_node, @relation_type, @weight, @reason, @metadata, @created_at)`,
        )
        .run(row)
      return true
    })()
    if (inserted) {
      this.getEventBus()?.emitTyped('edge:created', {
        edgeId: edge.id,
        from: edge.from,
        to: edge.to,
        relationType: edge.relationType,
      })
    }
  }

  getEdgesFrom(nodeId: string): GraphEdge[] {
    const pid = this.ensureProject()
    const rows = this.getStmt(
      `SELECT * FROM edges WHERE project_id = ? AND from_node = ? AND ${ACTIVE_EDGE_ENDPOINTS_PREDICATE}`,
    ).all(pid, nodeId) as EdgeRow[]
    return rows.map(rowToEdge)
  }

  getEdgesTo(nodeId: string): GraphEdge[] {
    const pid = this.ensureProject()
    const rows = this.getStmt(
      `SELECT * FROM edges WHERE project_id = ? AND to_node = ? AND ${ACTIVE_EDGE_ENDPOINTS_PREDICATE}`,
    ).all(pid, nodeId) as EdgeRow[]
    return rows.map(rowToEdge)
  }

  getAllEdges(): GraphEdge[] {
    const pid = this.ensureProject()
    const rows = this.getStmt(
      `SELECT * FROM edges WHERE project_id = ? AND ${ACTIVE_EDGE_ENDPOINTS_PREDICATE} ORDER BY created_at`,
    ).all(pid) as EdgeRow[]
    return rows.map(rowToEdge)
  }
}
