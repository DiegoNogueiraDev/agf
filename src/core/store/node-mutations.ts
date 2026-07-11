/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Node CRUD operations and bulk-insert helpers, extracted from sqlite-store.ts.
 *
 * WHY here: sqlite-store.ts exceeded 1 700 lines; node operations alone are
 * ~640 lines. NodeOps receives its dependencies via constructor injection so
 * SqliteStore stays as a thin facade that delegates here.
 *
 * Composing modules: depends on sqlite-converters.ts for row types/helpers,
 * and on graph-types/utils/hooks for domain types and side-effects.
 * SqliteStore wires up the dependencies and exposes the same public API surface.
 */

import type Database from 'better-sqlite3'
import type { GraphNode, GraphEdge, NodeType, NodeStatus } from '../graph/graph-types.js'
import type { GraphEventBus } from '../events/event-bus.js'
import { createLogger } from '../utils/logger.js'
import { now } from '../utils/time.js'
import { normalizeNewlines } from '../utils/text.js'
import { ValidationError, ConflictError } from '../utils/errors.js'
import { GraphNodeSchema } from '../../schemas/node.schema.js'
import { z } from 'zod/v4'
import { dispatchHookWithResult } from '../hooks/register-hook.js'
import { StatusChangeDeniedError } from '../hooks/hook-types.js'
import { timedQuery } from '../utils/slow-query-logger.js'
import {
  type MutationOptions,
  type NodeRow,
  nodeToRow,
  rowToNode,
  edgeToRow,
  MAX_NODE_METADATA_SIZE,
  ACTIVE_NODE_PREDICATE,
} from './sqlite-converters.js'

const log = createLogger({ layer: 'core', source: 'node-mutations.ts' })

/**
 * All node-level CRUD operations for the graph store, plus bulk-insert helpers.
 * Receives db, getStmt, ensureProject, and a getEventBus callback from SqliteStore
 * so it never imports SqliteStore itself (avoids circular deps).
 */
export class NodeOps {
  constructor(
    private readonly db: Database.Database,
    private readonly getStmt: (sql: string) => Database.Statement,
    private readonly ensureProject: () => string,
    private readonly getEventBus: () => GraphEventBus | null,
  ) {}

  insertNode(node: GraphNode, options?: MutationOptions): void {
    try {
      GraphNodeSchema.parse(node)
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new ValidationError('Invalid node', err.issues)
      }
      throw err
    }
    // Bug #E1-T14: validate node metadata JSON size
    if (node.metadata) {
      const metadataJson = JSON.stringify(node.metadata)
      if (metadataJson.length > MAX_NODE_METADATA_SIZE) {
        throw new ValidationError(
          `Node metadata too large (${metadataJson.length} chars, max ${MAX_NODE_METADATA_SIZE})`,
          [],
        )
      }
    }
    // Bug #E1-T09: reject self-referencing parentId on insert
    if (node.parentId && node.parentId === node.id) {
      throw new ValidationError(`Node '${node.id}' cannot be its own parent`, [])
    }

    const pid = this.ensureProject()
    const normalized = { ...node, description: normalizeNewlines(node.description) }
    const row = nodeToRow(normalized, pid)
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO nodes
            (id, project_id, type, title, description, status, priority,
             xp_size, estimate_minutes, tags, parent_id, sprint,
             source_file, source_start_line, source_end_line, source_confidence,
             acceptance_criteria, test_files, implementation_files, blocked, metadata,
             evolution_reason, evolution_count,
             created_at, updated_at, modified_by)
           VALUES
            (@id, @project_id, @type, @title, @description, @status, @priority,
             @xp_size, @estimate_minutes, @tags, @parent_id, @sprint,
             @source_file, @source_start_line, @source_end_line, @source_confidence,
             @acceptance_criteria, @test_files, @implementation_files, @blocked, @metadata,
             @evolution_reason, @evolution_count,
             @created_at, @updated_at, @modified_by)`,
        )
        .run({ ...row, modified_by: options?.agentId ?? null })
    })()
    // Event emitted AFTER transaction succeeds
    this.getEventBus()?.emitTyped('node:created', { nodeId: node.id, title: node.title, nodeType: node.type })
  }

  getNodeById(id: string): GraphNode | null {
    const pid = this.ensureProject()
    const row = this.getStmt(
      'SELECT * FROM nodes WHERE id = ? AND project_id = ? AND (archived = 0 OR archived IS NULL)',
    ).get(id, pid) as NodeRow | undefined
    return row ? rowToNode(row) : null
  }

  getAllNodes(): GraphNode[] {
    const pid = this.ensureProject()
    const rows = this.getStmt(
      'SELECT * FROM nodes WHERE project_id = ? AND (archived = 0 OR archived IS NULL) ORDER BY created_at',
    ).all(pid) as NodeRow[]
    return rows.map(rowToNode)
  }

  /** Paginated + filtered node query for dashboard API. */
  queryNodes(opts: { limit?: number; offset?: number; status?: NodeStatus[]; type?: NodeType[]; search?: string }): {
    nodes: GraphNode[]
    totalCount: number
  } {
    const pid = this.ensureProject()
    // E10-T05: Validate limit/offset boundaries
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500)
    const offset = Math.max(opts.offset ?? 0, 0)

    const conditions: string[] = ['project_id = ?', ACTIVE_NODE_PREDICATE]
    const params: unknown[] = [pid]

    if (opts.status && opts.status.length > 0) {
      const placeholders = opts.status.map(() => '?').join(', ')
      conditions.push(`status IN (${placeholders})`)
      params.push(...opts.status)
    }

    if (opts.type && opts.type.length > 0) {
      const placeholders = opts.type.map(() => '?').join(', ')
      conditions.push(`type IN (${placeholders})`)
      params.push(...opts.type)
    }

    if (opts.search) {
      conditions.push('title LIKE ?')
      params.push(`%${opts.search}%`)
    }

    const where = conditions.join(' AND ')

    const countRow = this.db.prepare(`SELECT COUNT(*) as cnt FROM nodes WHERE ${where}`).get(...params) as {
      cnt: number
    }
    const totalCount = countRow.cnt

    const rows = this.db
      .prepare(`SELECT * FROM nodes WHERE ${where} ORDER BY created_at LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as NodeRow[]

    return { nodes: rows.map(rowToNode), totalCount }
  }

  getNodesByType(type: NodeType): GraphNode[] {
    const pid = this.ensureProject()
    const rows = this.getStmt(
      `SELECT * FROM nodes WHERE project_id = ? AND type = ? AND ${ACTIVE_NODE_PREDICATE} ORDER BY created_at`,
    ).all(pid, type) as NodeRow[]
    return rows.map(rowToNode)
  }

  getNodesByStatus(status: NodeStatus): GraphNode[] {
    const pid = this.ensureProject()
    const rows = this.getStmt(
      `SELECT * FROM nodes WHERE project_id = ? AND status = ? AND ${ACTIVE_NODE_PREDICATE} ORDER BY created_at`,
    ).all(pid, status) as NodeRow[]
    return rows.map(rowToNode)
  }

  getChildNodes(parentId: string): GraphNode[] {
    const pid = this.ensureProject()
    const rows = this.getStmt(
      `SELECT * FROM nodes WHERE project_id = ? AND parent_id = ? AND ${ACTIVE_NODE_PREDICATE} ORDER BY created_at`,
    ).all(pid, parentId) as NodeRow[]
    return rows.map(rowToNode)
  }

  updateNodeStatus(id: string, status: NodeStatus, options?: MutationOptions): GraphNode | null {
    const pid = this.ensureProject()
    const timestamp = now()

    // Read old status for changelog before mutation
    const oldNode = this.getNodeById(id)
    if (!oldNode) return null
    const oldStatus = oldNode.status

    if (oldStatus !== status) {
      // Hook: pré-transição (canal status:pre-change). skipHooks bypasses enforcement.
      if (!options?.skipHooks) {
        const decision = dispatchHookWithResult('status:pre-change', { nodeId: id, from: oldStatus, to: status })
        if (decision.action === 'deny' || decision.action === 'halt') {
          throw new StatusChangeDeniedError(id, oldStatus, status, decision.reason ?? decision.action)
        }
      }
    }

    const agentId = options?.agentId ?? null
    const setClauses = ['status = ?', 'updated_at = ?']
    const params: unknown[] = [status, timestamp]

    if (agentId) {
      setClauses.push('modified_by = ?')
      params.push(agentId)
    }

    const resultValue = this.db
      .prepare(`UPDATE nodes SET ${setClauses.join(', ')} WHERE id = ? AND project_id = ?`)
      .run(...params, id, pid)

    if (resultValue.changes === 0) return null

    // Record status change in changelog with agent identity
    if (oldStatus !== status) {
      this.db
        .prepare(
          `INSERT INTO node_changelog (project_id, node_id, field, old_value, new_value, changed_at, agent_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(pid, id, 'status', oldStatus, status, timestamp, agentId)
    }

    this.getEventBus()?.emitTyped('node:updated', { nodeId: id, fields: ['status'] })
    return this.getNodeById(id)
  }

  /** Walk up the parent chain from newParentId; return true if nodeId is found (cycle). */
  private detectParentCycle(nodeId: string, newParentId: string): boolean {
    const pid = this.ensureProject()
    let current: string | null = newParentId
    const visited = new Set<string>()
    while (current) {
      if (current === nodeId) return true
      if (visited.has(current)) return false
      visited.add(current)
      const parent = this.db
        .prepare('SELECT parent_id FROM nodes WHERE id = ? AND project_id = ?')
        .get(current, pid) as { parent_id: string | null } | undefined
      current = parent?.parent_id ?? null
    }
    return false
  }

  updateNode(
    id: string,
    fields: Partial<
      Pick<
        GraphNode,
        | 'title'
        | 'description'
        | 'type'
        | 'priority'
        | 'xpSize'
        | 'estimateMinutes'
        | 'tags'
        | 'parentId'
        | 'sprint'
        | 'blocked'
        | 'acceptanceCriteria'
        | 'testFiles'
        | 'implementationFiles'
        | 'metadata'
        | 'evolutionReason'
      >
    >,
    options?: MutationOptions,
  ): GraphNode | null {
    const pid = this.ensureProject()
    const existing = this.getNodeById(id)
    if (!existing) return null

    const setClauses: string[] = []
    const params: unknown[] = []

    if (fields.title !== undefined) {
      setClauses.push('title = ?')
      params.push(fields.title)
    }
    if (fields.description !== undefined) {
      setClauses.push('description = ?')
      params.push(normalizeNewlines(fields.description) ?? null)
    }
    if (fields.type !== undefined) {
      setClauses.push('type = ?')
      params.push(fields.type)
    }
    if (fields.priority !== undefined) {
      setClauses.push('priority = ?')
      params.push(fields.priority)
    }
    if (fields.xpSize !== undefined) {
      setClauses.push('xp_size = ?')
      params.push(fields.xpSize ?? null)
    }
    if (fields.estimateMinutes !== undefined) {
      setClauses.push('estimate_minutes = ?')
      params.push(fields.estimateMinutes ?? null)
    }
    if (fields.tags !== undefined) {
      setClauses.push('tags = ?')
      params.push(fields.tags ? JSON.stringify(fields.tags) : null)
    }
    if (fields.parentId !== undefined) {
      if (fields.parentId !== null && fields.parentId !== undefined) {
        if (fields.parentId === id || this.detectParentCycle(id, fields.parentId)) {
          throw new ValidationError(`Setting parentId '${fields.parentId}' on node '${id}' would create a cycle`, [])
        }
      }
      setClauses.push('parent_id = ?')
      params.push(fields.parentId ?? null)
    }
    if (fields.sprint !== undefined) {
      setClauses.push('sprint = ?')
      params.push(fields.sprint ?? null)
    }
    if (fields.blocked !== undefined) {
      setClauses.push('blocked = ?')
      params.push(fields.blocked ? 1 : 0)
    }
    if (fields.acceptanceCriteria !== undefined) {
      setClauses.push('acceptance_criteria = ?')
      params.push(fields.acceptanceCriteria ? JSON.stringify(fields.acceptanceCriteria) : null)
    }
    if (fields.testFiles !== undefined) {
      setClauses.push('test_files = ?')
      params.push(fields.testFiles ? JSON.stringify(fields.testFiles) : null)
    }
    if (fields.implementationFiles !== undefined) {
      setClauses.push('implementation_files = ?')
      params.push(fields.implementationFiles ? JSON.stringify(fields.implementationFiles) : null)
    }
    if (fields.metadata !== undefined) {
      // Bug #E1-T14: validate node metadata JSON size
      if (fields.metadata) {
        const metadataJson = JSON.stringify(fields.metadata)
        if (metadataJson.length > MAX_NODE_METADATA_SIZE) {
          throw new ValidationError(
            `Node metadata too large (${metadataJson.length} chars, max ${MAX_NODE_METADATA_SIZE})`,
            [],
          )
        }
      }
      setClauses.push('metadata = ?')
      params.push(fields.metadata ? JSON.stringify(fields.metadata) : null)
    }
    if (fields.evolutionReason !== undefined) {
      // §extracta — atomic increment of evolution_count alongside the reason set.
      setClauses.push('evolution_reason = ?')
      params.push(fields.evolutionReason)
      if (fields.evolutionReason !== null) {
        setClauses.push('evolution_count = COALESCE(evolution_count, 0) + 1')
      } else {
        setClauses.push('evolution_count = 0')
      }
    }

    if (setClauses.length === 0) return existing

    // Agent tracking (ADR-10): update modified_by and increment version
    if (options?.agentId) {
      setClauses.push('modified_by = ?')
      params.push(options.agentId)
    }
    setClauses.push('version = version + 1')

    const timestamp = now()
    setClauses.push('updated_at = ?')
    params.push(timestamp)
    params.push(id, pid)

    // ── Transaction: re-read existing + changelog + optimistic lock + write ──
    // Fix E1-T01: existing must be read INSIDE transaction to prevent race condition
    const serialize = (v: unknown): string | null => {
      if (v === undefined || v === null) return null
      if (typeof v === 'object') return JSON.stringify(v)
      return String(v)
    }

    const fieldMap: Record<string, (n: GraphNode) => unknown> = {
      title: (n) => n.title,
      description: (n) => n.description,
      type: (n) => n.type,
      priority: (n) => n.priority,
      xpSize: (n) => n.xpSize,
      estimateMinutes: (n) => n.estimateMinutes,
      tags: (n) => n.tags,
      parentId: (n) => n.parentId,
      sprint: (n) => n.sprint,
      blocked: (n) => n.blocked,
      acceptanceCriteria: (n) => n.acceptanceCriteria,
      testFiles: (n) => n.testFiles,
      implementationFiles: (n) => n.implementationFiles,
      metadata: (n) => n.metadata,
      evolutionReason: (n) => n.evolutionReason,
    }

    this.db.transaction(() => {
      // Re-read existing inside transaction for race-safe changelog diff
      const txExisting = this.getNodeById(id)
      const changelogEntries: Array<{ field: string; oldValue: string | null; newValue: string | null }> = []
      if (txExisting) {
        for (const key of Object.keys(fields) as Array<keyof typeof fields>) {
          const getter = fieldMap[key]
          if (!getter) continue
          const oldVal = serialize(getter(txExisting))
          const newVal = serialize(fields[key])
          if (oldVal !== newVal) {
            changelogEntries.push({ field: key, oldValue: oldVal, newValue: newVal })
          }
        }
      }
      // Optimistic locking (ADR-08): if expectedVersion provided, verify before write
      if (options?.expectedVersion !== undefined) {
        const current = this.db
          .prepare('SELECT version, modified_by, updated_at FROM nodes WHERE id = ? AND project_id = ?')
          .get(id, pid) as { version: number; modified_by: string | null; updated_at: string } | undefined

        if (current && current.version !== options.expectedVersion) {
          throw new ConflictError({
            currentVersion: current.version,
            expectedVersion: options.expectedVersion,
            modifiedBy: current.modified_by,
            modifiedAt: current.updated_at,
          })
        }
      }

      this.db.prepare(`UPDATE nodes SET ${setClauses.join(', ')} WHERE id = ? AND project_id = ?`).run(...params)

      if (changelogEntries.length > 0) {
        const insertChangelog = this.db.prepare(
          `INSERT INTO node_changelog (project_id, node_id, field, old_value, new_value, changed_at, agent_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        const agentId = options?.agentId ?? null
        for (const entry of changelogEntries) {
          insertChangelog.run(pid, id, entry.field, entry.oldValue, entry.newValue, timestamp, agentId)
        }
      }
    })()

    this.getEventBus()?.emitTyped('node:updated', { nodeId: id, fields: Object.keys(fields) })
    return this.getNodeById(id)
  }

  getNodeHistory(nodeId: string): Array<{
    field: string
    oldValue: string | null
    newValue: string | null
    changedAt: string
    agentId: string | null
  }> {
    const pid = this.ensureProject()
    const rows = this.db
      .prepare(
        `SELECT field, old_value, new_value, changed_at, agent_id FROM node_changelog WHERE project_id = ? AND node_id = ? ORDER BY changed_at DESC, id DESC`,
      )
      .all(pid, nodeId) as Array<{
      field: string
      old_value: string | null
      new_value: string | null
      changed_at: string
      agent_id: string | null
    }>
    return rows.map((r) => ({
      field: r.field,
      oldValue: r.old_value,
      newValue: r.new_value,
      changedAt: r.changed_at,
      agentId: r.agent_id,
    }))
  }

  deleteNode(id: string, nowMs: number = Date.now()): boolean {
    const pid = this.ensureProject()
    log.debug('tx:archive-node', { id })

    // Bug #050: collect events inside transaction, emit AFTER commit
    const archivedNodeIds: string[] = []

    const archived = this.db.transaction(() => {
      // Recursively collect active descendant node IDs
      const toArchive: string[] = []
      const collectDescendants = (nodeId: string): void => {
        toArchive.push(nodeId)
        const children = this.db
          .prepare('SELECT id FROM nodes WHERE project_id = ? AND parent_id = ? AND archived = 0')
          .all(pid, nodeId) as { id: string }[]
        for (const child of children) {
          collectDescendants(child.id)
        }
      }
      collectDescendants(id)

      if (toArchive.length > 0) {
        const placeholders = toArchive.map(() => '?').join(',')
        const result = this.db
          .prepare(
            `UPDATE nodes SET archived = 1, archived_at = ? WHERE project_id = ? AND id IN (${placeholders}) AND archived = 0`,
          )
          .run(nowMs, pid, ...toArchive)
        if (result.changes > 0) {
          archivedNodeIds.push(...toArchive)
        }
      }

      return archivedNodeIds.length > 0
    })()

    for (const nodeId of archivedNodeIds) {
      this.getEventBus()?.emitTyped('node:deleted', { nodeId })
    }

    return archived
  }

  restoreNode(id: string): boolean {
    const pid = this.ensureProject()

    // Read the target's archive timestamp to scope the cascade (AUDIT-012).
    const target = this.db
      .prepare('SELECT archived, archived_at FROM nodes WHERE id = ? AND project_id = ?')
      .get(id, pid) as { archived: number; archived_at: number | null } | undefined
    if (!target || target.archived !== 1) return false

    const restoredIds: string[] = []
    const restored = this.db.transaction(() => {
      const toRestore: string[] = []
      const collectArchivedSubtree = (nodeId: string): void => {
        toRestore.push(nodeId)
        const children = this.db
          .prepare('SELECT id FROM nodes WHERE project_id = ? AND parent_id = ? AND archived = 1 AND archived_at IS ?')
          .all(pid, nodeId, target.archived_at) as { id: string }[]
        for (const child of children) collectArchivedSubtree(child.id)
      }
      collectArchivedSubtree(id)

      const placeholders = toRestore.map(() => '?').join(',')
      const result = this.db
        .prepare(
          `UPDATE nodes SET archived = 0, archived_at = NULL
           WHERE project_id = ? AND id IN (${placeholders}) AND archived = 1`,
        )
        .run(pid, ...toRestore)
      if (result.changes > 0) restoredIds.push(...toRestore)
      return result.changes > 0
    })()

    // AUDIT-017: emit so snapshot caches / listeners refresh
    for (const restoredId of restoredIds) {
      this.getEventBus()?.emitTyped('node:updated', { nodeId: restoredId, fields: ['archived'] })
    }

    return restored
  }

  searchNodes(pid: string, query: string, limit: number): Array<GraphNode & { score: number }> {
    // FTS5 match query. AUDIT-009: the FTS sync trigger re-indexes a row on the archive
    // UPDATE, so soft-deleted nodes stay in the index — exclude them on the joined row.
    const sql = `SELECT n.*, bm25(nodes_fts) AS score
         FROM nodes_fts fts
         JOIN nodes n ON n.rowid = fts.rowid
         WHERE nodes_fts MATCH ?
           AND n.project_id = ?
           AND (n.archived = 0 OR n.archived IS NULL)
         ORDER BY score
         LIMIT ?`
    try {
      const rows = timedQuery(sql, () => this.db.prepare(sql).all(query, pid, limit)) as (NodeRow & {
        score: number
      })[]
      return rows.map((row) => ({
        ...rowToNode(row),
        score: Math.abs(row.score),
      }))
    } catch (err) {
      // AUDIT-016: degrade to LIKE scan on invalid FTS5 expression (DoS surface).
      log.debug('searchNodes:fts-syntax-fallback', { error: String(err) })
      return this.searchNodesLike(pid, query, limit)
    }
  }

  /** LIKE-based fallback for {@link searchNodes} when the FTS5 expression is invalid (AUDIT-016). */
  private searchNodesLike(pid: string, query: string, limit: number): Array<GraphNode & { score: number }> {
    const term = `%${query}%`
    const sql = `SELECT * FROM nodes
         WHERE project_id = ? AND ${ACTIVE_NODE_PREDICATE}
           AND (title LIKE ? OR COALESCE(description, '') LIKE ?)
         ORDER BY created_at DESC
         LIMIT ?`
    const rows = this.db.prepare(sql).all(pid, term, term, limit) as NodeRow[]
    return rows.map((row) => ({ ...rowToNode(row), score: 1 }))
  }

  bulkInsert(nodes: GraphNode[], edges: GraphEdge[]): void {
    const pid = this.ensureProject()
    log.info(`Bulk insert: ${nodes.length} nodes, ${edges.length} edges`)

    log.debug('tx:bulk-insert:start')
    this.db.transaction(() => {
      for (const node of nodes) {
        const row = nodeToRow(node, pid)
        this.db
          .prepare(
            `INSERT INTO nodes
              (id, project_id, type, title, description, status, priority,
               xp_size, estimate_minutes, tags, parent_id, sprint,
               source_file, source_start_line, source_end_line, source_confidence,
               acceptance_criteria, test_files, implementation_files, blocked, metadata,
               evolution_reason, evolution_count, created_at, updated_at)
             VALUES
              (@id, @project_id, @type, @title, @description, @status, @priority,
               @xp_size, @estimate_minutes, @tags, @parent_id, @sprint,
               @source_file, @source_start_line, @source_end_line, @source_confidence,
               @acceptance_criteria, @test_files, @implementation_files, @blocked, @metadata,
               @evolution_reason, @evolution_count, @created_at, @updated_at)`,
          )
          .run(row)
      }
      // Bug #E4-T02: validate node existence inside transaction before edge insert
      // AUDIT-011: archived endpoints are not valid anchors for a new edge.
      const nodeExistsStmt = this.db.prepare(
        `SELECT 1 FROM nodes WHERE id = ? AND project_id = ? AND ${ACTIVE_NODE_PREDICATE}`,
      )
      for (const edge of edges) {
        const fromExists = nodeExistsStmt.get(edge.from, pid)
        const toExists = nodeExistsStmt.get(edge.to, pid)
        if (!fromExists || !toExists) {
          log.debug('bulk-insert:edge:skipped:missing-node', { edgeId: edge.id, from: edge.from, to: edge.to })
          continue
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
      }
    })()
    log.debug('tx:bulk-insert:done')
    this.getEventBus()?.emitTyped('import:completed', { nodesCreated: nodes.length, edgesCreated: edges.length })
  }

  /**
   * Merge-insert nodes and edges using INSERT OR IGNORE semantics for both.
   * Existing nodes (by ID) and edges (by unique constraint) are silently skipped.
   * Returns actual counts of rows inserted.
   */
  mergeInsert(nodes: GraphNode[], edges: GraphEdge[]): { nodesInserted: number; edgesInserted: number } {
    const pid = this.ensureProject()
    log.info('merge-insert:start', { nodes: nodes.length, edges: edges.length })

    let nodesInserted = 0
    let edgesInserted = 0

    this.db.transaction(() => {
      for (const node of nodes) {
        const row = nodeToRow(node, pid)
        const resultValue = this.db
          .prepare(
            `INSERT OR IGNORE INTO nodes
              (id, project_id, type, title, description, status, priority,
               xp_size, estimate_minutes, tags, parent_id, sprint,
               source_file, source_start_line, source_end_line, source_confidence,
               acceptance_criteria, test_files, implementation_files, blocked, metadata,
               evolution_reason, evolution_count, created_at, updated_at)
             VALUES
              (@id, @project_id, @type, @title, @description, @status, @priority,
               @xp_size, @estimate_minutes, @tags, @parent_id, @sprint,
               @source_file, @source_start_line, @source_end_line, @source_confidence,
               @acceptance_criteria, @test_files, @implementation_files, @blocked, @metadata,
               @evolution_reason, @evolution_count, @created_at, @updated_at)`,
          )
          .run(row)
        nodesInserted += resultValue.changes
      }
      // Bug #E4-T02: validate node existence inside transaction before edge insert
      // AUDIT-011: archived endpoints are not valid anchors for a new edge.
      const nodeExistsStmt = this.db.prepare(
        `SELECT 1 FROM nodes WHERE id = ? AND project_id = ? AND ${ACTIVE_NODE_PREDICATE}`,
      )
      for (const edge of edges) {
        const fromExists = nodeExistsStmt.get(edge.from, pid)
        const toExists = nodeExistsStmt.get(edge.to, pid)
        if (!fromExists || !toExists) {
          log.debug('merge-insert:edge:skipped:missing-node', { edgeId: edge.id, from: edge.from, to: edge.to })
          continue
        }
        const row = edgeToRow(edge, pid)
        const resultValue = this.db
          .prepare(
            `INSERT OR IGNORE INTO edges
              (id, project_id, from_node, to_node, relation_type, weight, reason, metadata, created_at)
             VALUES
              (@id, @project_id, @from_node, @to_node, @relation_type, @weight, @reason, @metadata, @created_at)`,
          )
          .run(row)
        edgesInserted += resultValue.changes
      }
    })()

    log.info('merge-insert:done', { nodesInserted, edgesInserted })
    this.getEventBus()?.emitTyped('import:completed', { nodesCreated: nodesInserted, edgesCreated: edgesInserted })
    return { nodesInserted, edgesInserted }
  }
}
