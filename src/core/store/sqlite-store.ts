/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * SqliteStore — thin facade over node-mutations.ts and edge-mutations.ts.
 *
 * WHY split: the original file exceeded 1 700 lines. Converters live in
 * sqlite-converters.ts; node CRUD in node-mutations.ts (NodeOps); edge CRUD
 * in edge-mutations.ts (EdgeOps). SqliteStore owns infrastructure (open,
 * close, project lifecycle, snapshots, stats, search) and delegates all node
 * and edge operations to the two sub-modules via constructor-injected ops.
 */

import type Database from 'better-sqlite3'
import { createDatabase } from './database-factory.js'
import { resolveStoreRoot } from './resolve-store-root.js'
import { mkdirSync, existsSync } from 'node:fs'
import { checkDbIntegrity, checkDbIntegrityForSnapshot, restoreLastBackup } from './db-recovery.js'
import path from 'node:path'
import type { GraphDocument, GraphNode, GraphEdge, GraphProject, NodeType, NodeStatus } from '../graph/graph-types.js'
import { buildIndexes } from '../graph/graph-indexes.js'
import { generateId } from '../utils/id.js'
import { now } from '../utils/time.js'
import { configureDb, runMigrations } from './migrations.js'
import { createLogger } from '../utils/logger.js'
import { OperationError } from '../utils/errors.js'
import { sqliteConnectionsActive } from '../observability/metrics.js'
import {
  GraphNotInitializedError,
  ValidationError,
  SnapshotNotFoundError,
  McpGraphError,
  GraphIntegrityError,
} from '../utils/errors.js'
import { GraphNodeSchema } from '../../schemas/node.schema.js'
import { STORE_DIR, DB_FILE } from '../utils/constants.js'
import { AsyncMutex } from '../utils/async-mutex.js'
import { NodeOps } from './node-mutations.js'
import { EdgeOps } from './edge-mutations.js'
import { type ProjectRow, rowToProject, nodeToRow, edgeToRow, ACTIVE_NODE_PREDICATE } from './sqlite-converters.js'

// Re-export so existing consumers of MutationOptions from this module keep working.
export type { MutationOptions } from './sqlite-converters.js'

const log = createLogger({ layer: 'core', source: 'sqlite-store.ts' })

// ── SqliteStore ──────────────────────────────────────────

export class SqliteStore {
  private db: Database.Database
  private projectId: string | null = null
  private _eventBus: import('../events/event-bus.js').GraphEventBus | null = null
  /** Serializes multi-step write sequences that span async boundaries. */
  readonly writeMutex = new AsyncMutex()
  /** Cached prepared statements keyed by literal SQL text — avoids re-parsing on hot paths. */
  private readonly statements = new Map<string, Database.Statement>()
  private readonly nodeOps: NodeOps
  private readonly edgeOps: EdgeOps

  private constructor(db: Database.Database) {
    this.db = db
    this.nodeOps = new NodeOps(db, this.getStmt.bind(this), this.ensureProject.bind(this), () => this._eventBus)
    this.edgeOps = new EdgeOps(db, this.getStmt.bind(this), this.ensureProject.bind(this), () => this._eventBus)
  }

  /**
   * Return a prepared statement for the given SQL, caching it for reuse.
   * Only safe for queries with literal SQL text (no string interpolation per-call).
   */
  private getStmt(sql: string): Database.Statement {
    let stmt = this.statements.get(sql)
    if (!stmt) {
      stmt = this.db.prepare(sql)
      this.statements.set(sql, stmt)
    }
    return stmt
  }

  /** Attach an event bus to emit mutation events */
  set eventBus(bus: import('../events/event-bus.js').GraphEventBus | null) {
    this._eventBus = bus
  }

  get eventBus(): import('../events/event-bus.js').GraphEventBus | null {
    return this._eventBus
  }

  /**
   * Open (or create) a store at basePath/workflow-graph/graph.db.
   * Pass ":memory:" for in-memory testing.
   */
  static open(basePath: string = process.cwd()): SqliteStore {
    let db: Database.Database

    // node_db03edaf7caa — worktree-por-formiga: AGF_GRAPH_ROOT centraliza o
    // grafo da colônia; ausente ⇒ basePath intacto (byte-idêntico).
    basePath = resolveStoreRoot(basePath)

    if (basePath === ':memory:') {
      db = createDatabase(':memory:')
    } else {
      const newDir = path.join(basePath, STORE_DIR)
      mkdirSync(newDir, { recursive: true })
      db = createDatabase(path.join(newDir, DB_FILE))
    }

    configureDb(db)
    runMigrations(db)

    const store = new SqliteStore(db)

    // Auto-load project if one exists
    const row = db.prepare('SELECT id FROM projects LIMIT 1').get() as { id: string } | undefined
    if (row) store.projectId = row.id

    log.info(`Store opened${basePath === ':memory:' ? ' (in-memory)' : ` at ${basePath}`}`)
    return store
  }

  /**
   * Open a store at an absolute DB file path.
   * Creates the file and parent dirs if they don't exist.
   * Useful for global mode where the DB is at ~/.mcp-graph/graph.db.
   */
  static openDb(dbPath: string): SqliteStore {
    const dir = path.dirname(dbPath)
    mkdirSync(dir, { recursive: true })

    if (existsSync(dbPath) && !checkDbIntegrity(dbPath)) {
      const backupDir = path.join(dir, '.mcp-graph-backups')
      log.warn('store:integrity_fail', { dbPath, error: 'PRAGMA integrity_check failed' })
      const restored = restoreLastBackup(dbPath, backupDir)
      if (restored) {
        log.info('store:restored', { dbPath, backupDir })
      } else {
        log.error('store:unrecoverable', { dbPath })
        throw new OperationError(`store:unrecoverable — DB at ${dbPath} failed integrity check and no backup found`)
      }
    }

    const db = createDatabase(dbPath)
    configureDb(db)
    runMigrations(db)

    const store = new SqliteStore(db)

    // Auto-load project if one exists
    const row = db.prepare('SELECT id FROM projects LIMIT 1').get() as { id: string } | undefined
    if (row) store.projectId = row.id

    sqliteConnectionsActive.increment()
    log.info(`Store opened at ${dbPath}`)
    return store
  }

  /** Expose the raw database instance for extension modules (e.g. DocsCacheStore). */
  getDb(): Database.Database {
    return this.db
  }

  /**
   * Run `fn` exclusively under the write mutex.
   * Use this to serialize multi-step write sequences that span async boundaries.
   */
  async withWriteLock<T>(fn: () => T | Promise<T>): Promise<T> {
    return this.writeMutex.run(fn)
  }

  close(): void {
    this.statements.clear()
    this.db.close()
    sqliteConnectionsActive.decrement()
  }

  // ── Project ──────────────────────────────────────

  initProject(name?: string): GraphProject {
    // If no name provided and project already active, return current
    if (this.projectId && !name) {
      return this.getProject() as GraphProject
    }

    // If name provided, check if same as current project
    if (this.projectId && name) {
      const current = this.getProject() as GraphProject
      if (current.name === name) {
        return current
      }
      // Check if a project with this name already exists
      const existing = this.db.prepare('SELECT * FROM projects WHERE name = ?').get(name) as ProjectRow | undefined
      if (existing) {
        this.projectId = existing.id
        log.info('Project activated by name', { name, projectId: existing.id })
        return rowToProject(existing)
      }
    }

    // No active project, or different name — check if project already exists by name
    const projectName = name || 'Local MCP Graph'
    const existing = this.db.prepare('SELECT * FROM projects WHERE name = ?').get(projectName) as ProjectRow | undefined
    if (existing) {
      this.projectId = existing.id
      log.info('Project activated by name', { name: projectName, projectId: existing.id })
      return rowToProject(existing)
    }

    // If no name provided but a project exists in DB, reuse it
    if (!name) {
      const anyProject = this.db.prepare('SELECT * FROM projects LIMIT 1').get() as ProjectRow | undefined
      if (anyProject) {
        this.projectId = anyProject.id
        log.info('Project activated (existing)', { name: anyProject.name, projectId: anyProject.id })
        return rowToProject(anyProject)
      }
    }

    // Truly no project exists — create new
    const id = generateId('proj')
    const timestamp = now()
    this.db
      .prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(id, projectName, timestamp, timestamp)

    this.projectId = id
    log.info(`Project initialized: ${projectName} (${id})`)
    return { id, name: projectName, createdAt: timestamp, updatedAt: timestamp }
  }

  getProject(): GraphProject | null {
    if (!this.projectId) return null
    const row = this.getStmt('SELECT * FROM projects WHERE id = ?').get(this.projectId) as ProjectRow | undefined
    if (!row) return null
    return rowToProject(row)
  }

  /** Alias for getProject — returns the currently active project. */
  getActiveProject(): GraphProject | null {
    return this.getProject()
  }

  /** List all projects in the database. */
  listProjects(): GraphProject[] {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY created_at').all() as ProjectRow[]
    return rows.map(rowToProject)
  }

  /** Switch the active project. Throws if project ID does not exist. */
  activateProject(projectId: string): void {
    const row = this.db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId) as { id: string } | undefined
    if (!row) {
      throw new ValidationError(`Project not found: ${projectId}`, [])
    }
    this.projectId = projectId
    log.info('Project activated', { projectId })
  }

  /**
   * Find a project by its filesystem path.
   * Returns null if no project is registered at that path.
   */
  findProjectByPath(fsPath: string): GraphProject | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE fs_path = ?').get(fsPath) as ProjectRow | undefined
    return row ? rowToProject(row) : null
  }

  /**
   * Register a project with a filesystem path.
   * If a project already exists at that path, returns the existing one.
   * Creates and activates a new project otherwise.
   */
  registerProject(name: string, fsPath: string): GraphProject {
    // Check if project already exists at this path
    const existing = this.findProjectByPath(fsPath)
    if (existing) {
      this.projectId = existing.id
      log.info('Project found by path', { name: existing.name, fsPath, projectId: existing.id })
      return existing
    }

    // Create new project with fs_path
    const id = generateId('proj')
    const timestamp = now()
    this.db
      .prepare('INSERT INTO projects (id, name, fs_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, name, fsPath, timestamp, timestamp)

    this.projectId = id
    log.info(`Project registered: ${name} at ${fsPath} (${id})`)
    return { id, name, fsPath, createdAt: timestamp, updatedAt: timestamp }
  }

  /**
   * Set or update the filesystem path for a project.
   */
  setProjectFsPath(projectId: string, fsPath: string): void {
    const timestamp = now()
    this.db.prepare('UPDATE projects SET fs_path = ?, updated_at = ? WHERE id = ?').run(fsPath, timestamp, projectId)
    log.info('Project fs_path updated', { projectId, fsPath })
  }

  private ensureProject(): string {
    if (!this.projectId) {
      throw new GraphNotInitializedError()
    }
    return this.projectId
  }

  // ── Node delegation ───────────────────────────────

  insertNode(node: GraphNode, options?: import('./sqlite-converters.js').MutationOptions): void {
    return this.nodeOps.insertNode(node, options)
  }

  getNodeById(id: string): GraphNode | null {
    return this.nodeOps.getNodeById(id)
  }

  getAllNodes(): GraphNode[] {
    return this.nodeOps.getAllNodes()
  }

  queryNodes(opts: { limit?: number; offset?: number; status?: NodeStatus[]; type?: NodeType[]; search?: string }): {
    nodes: GraphNode[]
    totalCount: number
  } {
    return this.nodeOps.queryNodes(opts)
  }

  getNodesByType(type: NodeType): GraphNode[] {
    return this.nodeOps.getNodesByType(type)
  }

  getNodesByStatus(status: NodeStatus): GraphNode[] {
    return this.nodeOps.getNodesByStatus(status)
  }

  getChildNodes(parentId: string): GraphNode[] {
    return this.nodeOps.getChildNodes(parentId)
  }

  updateNodeStatus(
    id: string,
    status: NodeStatus,
    options?: import('./sqlite-converters.js').MutationOptions,
  ): GraphNode | null {
    return this.nodeOps.updateNodeStatus(id, status, options)
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
    options?: import('./sqlite-converters.js').MutationOptions,
  ): GraphNode | null {
    return this.nodeOps.updateNode(id, fields, options)
  }

  getNodeHistory(nodeId: string): Array<{
    field: string
    oldValue: string | null
    newValue: string | null
    changedAt: string
    agentId: string | null
  }> {
    return this.nodeOps.getNodeHistory(nodeId)
  }

  deleteNode(id: string, nowMs: number = Date.now()): boolean {
    return this.nodeOps.deleteNode(id, nowMs)
  }

  restoreNode(id: string): boolean {
    return this.nodeOps.restoreNode(id)
  }

  bulkInsert(nodes: GraphNode[], edges: GraphEdge[]): void {
    return this.nodeOps.bulkInsert(nodes, edges)
  }

  mergeInsert(nodes: GraphNode[], edges: GraphEdge[]): { nodesInserted: number; edgesInserted: number } {
    return this.nodeOps.mergeInsert(nodes, edges)
  }

  // ── Edge delegation ───────────────────────────────

  deleteEdge(id: string): boolean {
    return this.edgeOps.deleteEdge(id)
  }

  insertEdge(edge: GraphEdge): void {
    return this.edgeOps.insertEdge(edge)
  }

  getEdgesFrom(nodeId: string): GraphEdge[] {
    return this.edgeOps.getEdgesFrom(nodeId)
  }

  getEdgesTo(nodeId: string): GraphEdge[] {
    return this.edgeOps.getEdgesTo(nodeId)
  }

  getAllEdges(): GraphEdge[] {
    return this.edgeOps.getAllEdges()
  }

  // ── Import helpers ────────────────────────────────

  hasImport(sourceFile: string): boolean {
    const pid = this.ensureProject()
    const row = this.getStmt('SELECT 1 FROM import_history WHERE project_id = ? AND source_file = ? LIMIT 1').get(
      pid,
      sourceFile,
    ) as unknown
    return row !== undefined
  }

  /**
   * Delete all nodes (and their edges) that were imported from a specific source file.
   * Also removes the import history entry so re-import is clean.
   */
  clearImportedNodes(sourceFile: string): { nodesDeleted: number; edgesDeleted: number } {
    const pid = this.ensureProject()
    log.debug('tx:clear-imported', { sourceFile })

    // Safety snapshot before destructive operation
    const snapshotId = this.createSnapshot()
    log.info('clear-imported:snapshot-created', { sourceFile, snapshotId })

    const cleared = this.db.transaction(() => {
      // Find node IDs from this source file
      const nodeIds = this.db
        .prepare('SELECT id FROM nodes WHERE project_id = ? AND source_file = ?')
        .all(pid, sourceFile) as { id: string }[]

      let edgesDeleted = 0

      for (const { id } of nodeIds) {
        const resultValue = this.db
          .prepare('DELETE FROM edges WHERE project_id = ? AND (from_node = ? OR to_node = ?)')
          .run(pid, id, id)
        edgesDeleted += resultValue.changes
      }

      const nodesResult = this.db
        .prepare('DELETE FROM nodes WHERE project_id = ? AND source_file = ?')
        .run(pid, sourceFile)

      // Clear import history for this source file
      this.db.prepare('DELETE FROM import_history WHERE project_id = ? AND source_file = ?').run(pid, sourceFile)

      return { nodesDeleted: nodesResult.changes, edgesDeleted }
    })()

    // Bug #050: emit after transaction committed
    this._eventBus?.emitTyped('bulk:updated', {
      count: cleared.nodesDeleted + cleared.edgesDeleted,
      operation: 'clearImportedNodes',
    })

    return cleared
  }

  // ── Bulk status update ────────────────────────────

  bulkUpdateStatus(ids: string[], status: NodeStatus): { updated: string[]; notFound: string[] } {
    this.ensureProject()
    log.debug('tx:bulk-update-status', { count: ids.length, status })
    const updated: string[] = []
    const notFound: string[] = []

    // AUDIT-014: suppress per-row emits during the txn, then emit per committed id after.
    const savedBus = this._eventBus
    this._eventBus = null
    try {
      this.db.transaction(() => {
        for (const id of ids) {
          const resultValue = this.nodeOps.updateNodeStatus(id, status)
          if (resultValue) {
            updated.push(id)
          } else {
            notFound.push(id)
          }
        }
      })()
    } finally {
      this._eventBus = savedBus
    }

    for (const id of updated) {
      this._eventBus?.emitTyped('node:updated', { nodeId: id, fields: ['status'] })
    }

    return { updated, notFound }
  }

  // ── Full-text search ──────────────────────────────

  /**
   * Search nodes using FTS5 with BM25 ranking.
   * Returns nodes ordered by relevance score.
   */
  searchNodes(query: string, limit: number = 20): Array<GraphNode & { score: number }> {
    const pid = this.ensureProject()
    return this.nodeOps.searchNodes(pid, query, limit)
  }

  // ── Snapshots ────────────────────────────────────

  createSnapshot(opts: { force?: boolean } = {}): number {
    if (!opts.force) {
      const { ok, issues } = checkDbIntegrityForSnapshot(this.db)
      if (!ok) {
        log.warn('snapshot:integrity-fail', { issues })
        throw new OperationError(
          `snapshot:integrity-check-failed — DB has ${issues.length} issue(s): ${issues.join('; ')}`,
        )
      }
    } else {
      const { ok, issues } = checkDbIntegrityForSnapshot(this.db)
      if (!ok) {
        log.warn('snapshot:force-with-corruption', { issues })
      }
    }
    const pid = this.ensureProject()
    const doc = this.toGraphDocument()
    const resultValue = this.db
      .prepare('INSERT INTO snapshots (project_id, data, created_at) VALUES (?, ?, ?)')
      .run(pid, JSON.stringify(doc), now())
    return resultValue.lastInsertRowid as number
  }

  // ── Import history ────────────────────────────────

  recordImport(sourceFile: string, nodesCreated: number, edgesCreated: number, rawText?: string): void {
    const pid = this.ensureProject()
    this.db
      .prepare(
        `INSERT INTO import_history (project_id, source_file, nodes_created, edges_created, imported_at, raw_text)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(pid, sourceFile, nodesCreated, edgesCreated, now(), rawText ?? null)
  }

  /** Raw text of the most recent import of `sourceFile`, or `null` (for --diff). */
  getImportRaw(sourceFile: string): string | null {
    const pid = this.ensureProject()
    const row = this.db
      .prepare(
        `SELECT raw_text FROM import_history
         WHERE project_id = ? AND source_file = ? AND raw_text IS NOT NULL
         ORDER BY imported_at DESC, id DESC LIMIT 1`,
      )
      .get(pid, sourceFile) as { raw_text: string } | undefined
    return row ? row.raw_text : null
  }

  // ── Stats ─────────────────────────────────────────

  getStats(): {
    totalNodes: number
    totalEdges: number
    byType: Record<string, number>
    byStatus: Record<string, number>
  } {
    const pid = this.ensureProject()

    const totalNodes = (
      this.getStmt(`SELECT COUNT(*) as c FROM nodes WHERE project_id = ? AND ${ACTIVE_NODE_PREDICATE}`).get(pid) as {
        c: number
      }
    ).c

    const totalEdges = (this.getStmt('SELECT COUNT(*) as c FROM edges WHERE project_id = ?').get(pid) as { c: number })
      .c

    const byType: Record<string, number> = {}
    const typeRows = this.getStmt(
      `SELECT type, COUNT(*) as c FROM nodes WHERE project_id = ? AND ${ACTIVE_NODE_PREDICATE} GROUP BY type`,
    ).all(pid) as { type: string; c: number }[]
    for (const rVar of typeRows) byType[rVar.type] = rVar.c

    const byStatus: Record<string, number> = {}
    const statusRows = this.getStmt(
      `SELECT status, COUNT(*) as c FROM nodes WHERE project_id = ? AND ${ACTIVE_NODE_PREDICATE} GROUP BY status`,
    ).all(pid) as { status: string; c: number }[]
    for (const rVar of statusRows) byStatus[rVar.status] = rVar.c

    return { totalNodes, totalEdges, byType, byStatus }
  }

  // ── Project Settings ───────────────────────────────

  getProjectSetting(key: string): string | null {
    const pid = this.ensureProject()
    const row = this.getStmt('SELECT value FROM project_settings WHERE project_id = ? AND key = ?').get(pid, key) as
      { value: string } | undefined
    return row?.value ?? null
  }

  setProjectSetting(key: string, value: string): void {
    const pid = this.ensureProject()
    const timestamp = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO project_settings (project_id, key, value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(project_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(pid, key, value, timestamp)
  }

  // ── Restore snapshot ──────────────────────────────

  restoreSnapshot(snapshotId: number): { nodesValid: number; nodesInvalid: number; edgesRestored: number } {
    const pid = this.ensureProject()
    log.debug('tx:restore-snapshot', { snapshotId })
    const row = this.db
      .prepare('SELECT data FROM snapshots WHERE rowid = ? AND project_id = ?')
      .get(snapshotId, pid) as { data: string } | undefined

    if (!row) {
      throw new SnapshotNotFoundError(snapshotId)
    }

    // Bug #048: validate snapshot JSON structure before restoring
    let doc: GraphDocument
    try {
      const parsed = JSON.parse(row.data)
      if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        throw new GraphIntegrityError('Invalid snapshot structure: missing nodes or edges arrays')
      }
      doc = parsed as GraphDocument
    } catch (err) {
      throw new McpGraphError(`Corrupt snapshot ${snapshotId}: ${err instanceof Error ? err.message : String(err)}`)
    }

    // Bug #E1-T11: validate each node with GraphNodeSchema before insert
    const validNodes: GraphNode[] = []
    let nodesInvalid = 0
    for (const node of doc.nodes) {
      const resultValue = GraphNodeSchema.safeParse(node)
      if (resultValue.success) {
        validNodes.push(resultValue.data as GraphNode)
      } else {
        nodesInvalid++
        log.warn('Invalid node in snapshot — skipped', {
          snapshotId,
          nodeId: (node as unknown as Record<string, unknown>).id ?? 'unknown',
          issues: resultValue.error.issues.map((i) => i.message).join('; '),
        })
      }
    }

    let edgesRestored = 0
    const snapshotNodeIds = validNodes.map((n) => n.id)
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM edges WHERE project_id = ?').run(pid)
      // AUDIT-008: only purge ACTIVE nodes — archived rows absent from snapshot survive.
      this.db.prepare(`DELETE FROM nodes WHERE project_id = ? AND ${ACTIVE_NODE_PREDICATE}`).run(pid)
      const dropById = this.db.prepare('DELETE FROM nodes WHERE id = ? AND project_id = ?')
      for (const id of snapshotNodeIds) dropById.run(id, pid)

      for (const node of validNodes) {
        const rVar = nodeToRow(node, pid)
        this.db
          .prepare(
            `INSERT INTO nodes
              (id, project_id, type, title, description, status, priority,
               xp_size, estimate_minutes, tags, parent_id, sprint,
               source_file, source_start_line, source_end_line, source_confidence,
               acceptance_criteria, blocked, metadata, created_at, updated_at)
             VALUES
              (@id, @project_id, @type, @title, @description, @status, @priority,
               @xp_size, @estimate_minutes, @tags, @parent_id, @sprint,
               @source_file, @source_start_line, @source_end_line, @source_confidence,
               @acceptance_criteria, @blocked, @metadata, @created_at, @updated_at)`,
          )
          .run(rVar)
      }
      // node_4584fc7539ce: only restore edges whose BOTH endpoints are among the
      // nodes actually re-inserted to avoid dangling edges.
      const validIdSet = new Set(snapshotNodeIds)
      let edgesSkipped = 0
      for (const edge of doc.edges) {
        const rVar = edgeToRow(edge, pid)
        if (!validIdSet.has(rVar.from_node) || !validIdSet.has(rVar.to_node)) {
          edgesSkipped++
          continue
        }
        this.db
          .prepare(
            `INSERT INTO edges
              (id, project_id, from_node, to_node, relation_type, weight, reason, metadata, created_at)
             VALUES
              (@id, @project_id, @from_node, @to_node, @relation_type, @weight, @reason, @metadata, @created_at)`,
          )
          .run(rVar)
        edgesRestored++
      }
      if (edgesSkipped > 0) {
        log.warn('restoreSnapshot: skipped dangling edges (endpoint node invalid/absent)', {
          snapshotId,
          edgesSkipped,
        })
      }
    })()

    if (nodesInvalid > 0) {
      log.info('Snapshot restored with invalid nodes skipped', {
        snapshotId,
        nodesValid: validNodes.length,
        nodesInvalid,
        edgesRestored,
      })
    }

    return { nodesValid: validNodes.length, nodesInvalid, edgesRestored }
  }

  listSnapshots(): Array<{ snapshotId: number; createdAt: string }> {
    const pid = this.ensureProject()
    const rows = this.db
      .prepare('SELECT id, created_at FROM snapshots WHERE project_id = ? ORDER BY id DESC')
      .all(pid) as Array<{ id: number; created_at: string }>
    return rows.map((r) => ({ snapshotId: r.id, createdAt: r.created_at }))
  }

  // ── Bridge: materialize full GraphDocument ─────────

  toGraphDocument(): GraphDocument {
    const project = this.getProject()
    if (!project) {
      throw new GraphNotInitializedError()
    }

    const nodes = this.nodeOps.getAllNodes()
    const edges = this.edgeOps.getAllEdges()
    const indexes = buildIndexes(nodes, edges)

    // Collect source files from import history
    const pid = this.ensureProject()
    const imports = this.getStmt('SELECT DISTINCT source_file FROM import_history WHERE project_id = ?').all(pid) as {
      source_file: string
    }[]

    const lastImportRow = this.getStmt(
      'SELECT imported_at FROM import_history WHERE project_id = ? ORDER BY imported_at DESC LIMIT 1',
    ).get(pid) as { imported_at: string } | undefined

    return {
      version: '1.0.0',
      project,
      nodes,
      edges,
      indexes,
      meta: {
        sourceFiles: imports.map((r) => r.source_file),
        lastImport: lastImportRow?.imported_at ?? null,
      },
    }
  }
}
