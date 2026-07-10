/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Golden Store — CRUD + tagging for eval_golden rows (EPIC 18 — Evals + Golden Dataset).
 * Backs analyze(eval_run) by enumerating goldens per tool/project/tag.
 */

import type Database from 'better-sqlite3'
import { now } from '../utils/time.js'
import { generateId } from '../utils/id.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'golden-store.ts' })

export interface GoldenEntry {
  id: string
  input: string
  expected: string
  scorerKind: string
  tool: string
  projectId: string | null
  metadata: Record<string, unknown>
  tags: string[]
  createdAt: string
}

export interface GoldenFilter {
  tool?: string
  projectId?: string
  scorerKind?: string
  limit?: number
}

export interface GoldenUpdate {
  input?: string
  expected?: string
  scorerKind?: string
  tool?: string
  projectId?: string | null
  metadata?: Record<string, unknown>
  tags?: string[]
}

interface GoldenRow {
  id: string
  input: string
  expected: string
  scorer_kind: string
  tool: string
  project_id: string | null
  metadata: string | null
  tags: string | null
  created_at: string
}

function rowToEntry(row: GoldenRow): GoldenEntry {
  return {
    id: row.id,
    input: row.input,
    expected: row.expected,
    scorerKind: row.scorer_kind,
    tool: row.tool,
    projectId: row.project_id,
    metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {},
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : [],
    createdAt: row.created_at,
  }
}

export class GoldenStore {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  create(input: Omit<GoldenEntry, 'id' | 'createdAt'>): GoldenEntry {
    const id = generateId('gold')
    const createdAt = now()
    this.db
      .prepare(
        `INSERT INTO eval_golden (id, input, expected, scorer_kind, tool, project_id, metadata, tags, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.input,
        input.expected,
        input.scorerKind,
        input.tool,
        input.projectId,
        JSON.stringify(input.metadata ?? {}),
        JSON.stringify(input.tags ?? []),
        createdAt,
      )
    log.debug('golden-store: created', { id, tool: input.tool })
    return { ...input, id, createdAt, projectId: input.projectId }
  }

  get(id: string): GoldenEntry | null {
    const row = this.db.prepare(`SELECT * FROM eval_golden WHERE id = ?`).get(id) as GoldenRow | undefined
    return row ? rowToEntry(row) : null
  }

  list(filter: GoldenFilter = {}): GoldenEntry[] {
    const where: string[] = []
    const params: Array<string | number> = []
    if (filter.tool !== undefined) {
      where.push('tool = ?')
      params.push(filter.tool)
    }
    if (filter.projectId !== undefined) {
      where.push('project_id = ?')
      params.push(filter.projectId)
    }
    if (filter.scorerKind !== undefined) {
      where.push('scorer_kind = ?')
      params.push(filter.scorerKind)
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    const limitSql = typeof filter.limit === 'number' ? `LIMIT ${Math.max(0, filter.limit)}` : ''
    const rows = this.db
      .prepare(`SELECT * FROM eval_golden ${whereSql} ORDER BY created_at DESC, id DESC ${limitSql}`)
      .all(...params) as GoldenRow[]
    return rows.map(rowToEntry)
  }

  /** List goldens whose tags JSON array contains the requested tag. */
  listByTag(tag: string): GoldenEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM eval_golden
         WHERE EXISTS (
           SELECT 1 FROM json_each(eval_golden.tags) WHERE json_each.value = ?
         )
         ORDER BY created_at DESC, id DESC`,
      )
      .all(tag) as GoldenRow[]
    return rows.map(rowToEntry)
  }

  count(filter: GoldenFilter = {}): number {
    const where: string[] = []
    const params: Array<string | number> = []
    if (filter.tool !== undefined) {
      where.push('tool = ?')
      params.push(filter.tool)
    }
    if (filter.projectId !== undefined) {
      where.push('project_id = ?')
      params.push(filter.projectId)
    }
    if (filter.scorerKind !== undefined) {
      where.push('scorer_kind = ?')
      params.push(filter.scorerKind)
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM eval_golden ${whereSql}`).get(...params) as { n: number }
    return row.n
  }

  update(id: string, patch: GoldenUpdate): GoldenEntry | null {
    const current = this.get(id)
    if (!current) return null

    const next: GoldenEntry = {
      ...current,
      ...patch,
      metadata: patch.metadata ?? current.metadata,
      tags: patch.tags ?? current.tags,
      projectId: patch.projectId !== undefined ? patch.projectId : current.projectId,
    }

    this.db
      .prepare(
        `UPDATE eval_golden
         SET input = ?, expected = ?, scorer_kind = ?, tool = ?, project_id = ?, metadata = ?, tags = ?
         WHERE id = ?`,
      )
      .run(
        next.input,
        next.expected,
        next.scorerKind,
        next.tool,
        next.projectId,
        JSON.stringify(next.metadata),
        JSON.stringify(next.tags),
        id,
      )
    return next
  }

  delete(id: string): boolean {
    const resValue = this.db.prepare(`DELETE FROM eval_golden WHERE id = ?`).run(id)
    return resValue.changes > 0
  }
}
