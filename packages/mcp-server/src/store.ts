import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

interface NodeRow {
  id: string
  type: string
  title: string
  description: string | null
  status: string
  priority: number
  xp_size: string | null
  parent_id: string | null
  acceptance_criteria: string | null
  tags: string | null
  created_at: string
  updated_at: string
}

interface GraphNode {
  id: string
  type: string
  title: string
  description?: string
  status: string
  priority: number
  xpSize?: string
  parentId?: string
  acceptanceCriteria?: string[]
  tags?: string[]
  createdAt: string
  updatedAt: string
}

function rowToNode(row: NodeRow): GraphNode {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    priority: row.priority,
    xpSize: row.xp_size ?? undefined,
    parentId: row.parent_id ?? undefined,
    acceptanceCriteria: row.acceptance_criteria ? JSON.parse(row.acceptance_criteria) : undefined,
    tags: row.tags ? JSON.parse(row.tags) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class GraphStore {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('busy_timeout = 5000')
  }

  close(): void {
    this.db.close()
  }

  getNodeById(id: string): GraphNode | null {
    const row = this.db.prepare('SELECT * FROM nodes WHERE id = ?').get(id) as NodeRow | undefined
    return row ? rowToNode(row) : null
  }

  getAllNodes(): GraphNode[] {
    const rows = this.db.prepare('SELECT * FROM nodes ORDER BY created_at').all() as NodeRow[]
    return rows.map(rowToNode)
  }

  getNodesByType(type: string): GraphNode[] {
    const rows = this.db.prepare('SELECT * FROM nodes WHERE type = ? ORDER BY created_at').all(type) as NodeRow[]
    return rows.map(rowToNode)
  }

  getNodesByStatus(status: string): GraphNode[] {
    const rows = this.db
      .prepare('SELECT * FROM nodes WHERE status = ? ORDER BY priority ASC, created_at ASC')
      .all(status) as NodeRow[]
    return rows.map(rowToNode)
  }

  getChildNodes(parentId: string): GraphNode[] {
    const rows = this.db
      .prepare('SELECT * FROM nodes WHERE parent_id = ? ORDER BY created_at')
      .all(parentId) as NodeRow[]
    return rows.map(rowToNode)
  }

  addNode(node: {
    type: string
    title: string
    description?: string
    priority?: number
    parentId?: string
    acceptanceCriteria?: string[]
    tags?: string[]
    xpSize?: string
  }): GraphNode {
    const id = 'node_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20)
    const now = new Date().toISOString()
    const acceptanceCriteriaJson = node.acceptanceCriteria ? JSON.stringify(node.acceptanceCriteria) : null
    const tagsJson = node.tags ? JSON.stringify(node.tags) : null

    this.db
      .prepare(
        `INSERT INTO nodes (id, project_id, type, title, description, status, priority, xp_size, parent_id, acceptance_criteria, tags, created_at, updated_at)
         VALUES (?, (SELECT id FROM projects LIMIT 1), ?, ?, ?, 'backlog', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        node.type,
        node.title,
        node.description ?? null,
        node.priority ?? 3,
        node.xpSize ?? null,
        node.parentId ?? null,
        acceptanceCriteriaJson,
        tagsJson,
        now,
        now,
      )

    return this.getNodeById(id)!
  }

  updateNodeStatus(id: string, status: string): GraphNode | null {
    const now = new Date().toISOString()
    const result = this.db.prepare('UPDATE nodes SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id)

    if (result.changes === 0) return null
    return this.getNodeById(id)
  }

  updateNode(
    id: string,
    fields: Partial<{
      title: string
      description: string
      priority: number
      acceptanceCriteria: string[]
      tags: string[]
      xpSize: string
      parentId: string
    }>,
  ): GraphNode | null {
    const now = new Date().toISOString()
    const updates: string[] = []
    const params: unknown[] = []

    if (fields.title !== undefined) {
      updates.push('title = ?')
      params.push(fields.title)
    }
    if (fields.description !== undefined) {
      updates.push('description = ?')
      params.push(fields.description)
    }
    if (fields.priority !== undefined) {
      updates.push('priority = ?')
      params.push(fields.priority)
    }
    if (fields.acceptanceCriteria !== undefined) {
      updates.push('acceptance_criteria = ?')
      params.push(JSON.stringify(fields.acceptanceCriteria))
    }
    if (fields.tags !== undefined) {
      updates.push('tags = ?')
      params.push(JSON.stringify(fields.tags))
    }
    if (fields.xpSize !== undefined) {
      updates.push('xp_size = ?')
      params.push(fields.xpSize)
    }
    if (fields.parentId !== undefined) {
      updates.push('parent_id = ?')
      params.push(fields.parentId)
    }

    if (updates.length === 0) return this.getNodeById(id)

    updates.push('updated_at = ?')
    params.push(now)
    params.push(id)

    this.db.prepare(`UPDATE nodes SET ${updates.join(', ')} WHERE id = ?`).run(...params)
    return this.getNodeById(id)
  }

  findNextTask(): GraphNode | null {
    // Pull system: highest priority backlog task with no blockers
    const rows = this.db
      .prepare(
        `SELECT * FROM nodes
         WHERE type IN ('task', 'subtask')
           AND status = 'backlog'
         ORDER BY priority ASC, created_at ASC
         LIMIT 1`,
      )
      .all() as NodeRow[]

    return rows.length > 0 ? rowToNode(rows[0]) : null
  }

  countByStatus(): Record<string, number> {
    const rows = this.db.prepare('SELECT status, COUNT(*) as count FROM nodes GROUP BY status').all() as {
      status: string
      count: number
    }[]

    const counts: Record<string, number> = {}
    for (const r of rows) counts[r.status] = r.count
    return counts
  }

  countByType(): Record<string, number> {
    const rows = this.db.prepare('SELECT type, COUNT(*) as count FROM nodes GROUP BY type').all() as {
      type: string
      count: number
    }[]

    const counts: Record<string, number> = {}
    for (const r of rows) counts[r.type] = r.count
    return counts
  }

  getEdges(): { id: string; from: string; to: string; relationType: string }[] {
    return this.db
      .prepare('SELECT id, from_node as `from`, to_node as `to`, relation_type as relationType FROM edges')
      .all() as { id: string; from: string; to: string; relationType: string }[]
  }
}

export function openStore(projectDir?: string): GraphStore | null {
  const dir = projectDir ?? process.cwd()
  const dbPath = join(dir, 'workflow-graph', 'graph.db')

  if (!existsSync(dbPath)) {
    // Try resolving symlinks, or parent directories
    const altPath = resolve(dir, 'workflow-graph', 'graph.db')
    if (!existsSync(altPath)) return null
    return new GraphStore(altPath)
  }

  return new GraphStore(dbPath)
}
