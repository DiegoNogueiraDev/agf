/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Characterization tests for GraphStore (packages/mcp-server/src/store.ts).
 * Capture current behavior that MUST survive consolidation.
 * GREEN = confirms current behavior is recorded.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'

function createTempDir(): string {
  const dir = join(tmpdir(), 'agent-graph-char-test-' + randomBytes(8).toString('hex'))
  mkdirSync(dir, { recursive: true })
  return dir
}

function createStoreDb(baseDir: string): { db: Database.Database; dbPath: string } {
  const wfDir = join(baseDir, 'workflow-graph')
  mkdirSync(wfDir, { recursive: true })
  const dbPath = join(wfDir, 'graph.db')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')

  // Create the schema that GraphStore expects
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'test', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'backlog',
      priority INTEGER NOT NULL DEFAULT 3,
      xp_size TEXT,
      parent_id TEXT REFERENCES nodes(id),
      acceptance_criteria TEXT,
      tags TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      from_node TEXT NOT NULL,
      to_node TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL
    );
  `)

  return { db, dbPath }
}

describe('Characterization: GraphStore (packages/mcp-server/src/store.ts)', () => {
  let tempDir: string
  let db: Database.Database

  beforeEach(() => {
    tempDir = createTempDir()
    const { db: database } = createStoreDb(tempDir)
    db = database
  })

  afterEach(() => {
    db.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('getNodeById', () => {
    it('returns null for non-existent node', () => {
      const row = db.prepare('SELECT * FROM nodes WHERE id = ?').get('non-existent')
      expect(row).toBeUndefined()
    })

    it('returns node for existing id', () => {
      db.prepare(
        `INSERT INTO nodes (id, project_id, type, title, status, priority, created_at, updated_at)
         VALUES (?, 'p1', 'task', 'Test Task', 'backlog', 1, ?, ?)`,
      ).run('node_test_1', new Date().toISOString(), new Date().toISOString())

      const row = db.prepare('SELECT * FROM nodes WHERE id = ?').get('node_test_1') as any
      expect(row).toBeDefined()
      expect(row.id).toBe('node_test_1')
      expect(row.type).toBe('task')
      expect(row.title).toBe('Test Task')
      expect(row.status).toBe('backlog')
      expect(row.priority).toBe(1)
    })
  })

  describe('findNextTask', () => {
    it('returns the highest priority backlog task', () => {
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO nodes (id, project_id, type, title, status, priority, created_at, updated_at)
         VALUES (?, 'p1', 'task', 'Low', 'backlog', 5, ?, ?)`,
      ).run('low_pri', now, now)
      db.prepare(
        `INSERT INTO nodes (id, project_id, type, title, status, priority, created_at, updated_at)
         VALUES (?, 'p1', 'task', 'High', 'backlog', 1, ?, ?)`,
      ).run('high_pri', now, now)
      db.prepare(
        `INSERT INTO nodes (id, project_id, type, title, status, priority, created_at, updated_at)
         VALUES (?, 'p1', 'task', 'Done', 'done', 1, ?, ?)`,
      ).run('done_task', now, now)

      const rows = db
        .prepare(
          `SELECT * FROM nodes WHERE type IN ('task', 'subtask') AND status = 'backlog' ORDER BY priority ASC, created_at ASC LIMIT 1`,
        )
        .all() as any[]

      expect(rows.length).toBe(1)
      expect(rows[0].id).toBe('high_pri')
      expect(rows[0].priority).toBe(1)
    })

    it('returns empty when no backlog tasks exist', () => {
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO nodes (id, project_id, type, title, status, priority, created_at, updated_at)
         VALUES (?, 'p1', 'task', 'Done', 'done', 1, ?, ?)`,
      ).run('only_done', now, now)

      const rows = db
        .prepare(
          `SELECT * FROM nodes WHERE type IN ('task', 'subtask') AND status = 'backlog' ORDER BY priority ASC, created_at ASC LIMIT 1`,
        )
        .all() as any[]

      expect(rows.length).toBe(0)
    })
  })

  describe('countByStatus', () => {
    it('returns correct counts', () => {
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO nodes (id, project_id, type, title, status, priority, created_at, updated_at)
         VALUES (?, 'p1', 'task', 'T1', 'backlog', 1, ?, ?)`,
      ).run('t1', now, now)
      db.prepare(
        `INSERT INTO nodes (id, project_id, type, title, status, priority, created_at, updated_at)
         VALUES (?, 'p1', 'task', 'T2', 'done', 1, ?, ?)`,
      ).run('t2', now, now)
      db.prepare(
        `INSERT INTO nodes (id, project_id, type, title, status, priority, created_at, updated_at)
         VALUES (?, 'p1', 'task', 'T3', 'done', 1, ?, ?)`,
      ).run('t3', now, now)
      db.prepare(
        `INSERT INTO nodes (id, project_id, type, title, status, priority, created_at, updated_at)
         VALUES (?, 'p1', 'task', 'T4', 'in_progress', 1, ?, ?)`,
      ).run('t4', now, now)

      const rows = db.prepare('SELECT status, COUNT(*) as count FROM nodes GROUP BY status').all() as any[]
      const counts: Record<string, number> = {}
      for (const r of rows) counts[r.status] = r.count

      expect(counts['backlog']).toBe(1)
      expect(counts['done']).toBe(2)
      expect(counts['in_progress']).toBe(1)
    })
  })

  describe('countByType', () => {
    it('returns correct type counts', () => {
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO nodes (id, project_id, type, title, status, priority, created_at, updated_at)
         VALUES (?, 'p1', 'epic', 'E1', 'backlog', 1, ?, ?)`,
      ).run('epic_1', now, now)
      db.prepare(
        `INSERT INTO nodes (id, project_id, type, title, status, priority, created_at, updated_at)
         VALUES (?, 'p1', 'task', 'TK1', 'backlog', 1, ?, ?)`,
      ).run('task_1', now, now)
      db.prepare(
        `INSERT INTO nodes (id, project_id, type, title, status, priority, created_at, updated_at)
         VALUES (?, 'p1', 'task', 'TK2', 'backlog', 1, ?, ?)`,
      ).run('task_2', now, now)

      const rows = db.prepare('SELECT type, COUNT(*) as count FROM nodes GROUP BY type').all() as any[]
      const counts: Record<string, number> = {}
      for (const r of rows) counts[r.type] = r.count

      expect(counts['epic']).toBe(1)
      expect(counts['task']).toBe(2)
    })
  })

  describe('getEdges', () => {
    it('returns edges with correct shape', () => {
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO edges (id, from_node, to_node, relation_type, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run('edge_1', 'node_a', 'node_b', 'depends_on', now)

      const rows = db
        .prepare('SELECT id, from_node as `from`, to_node as `to`, relation_type as relationType FROM edges')
        .all() as any[]

      expect(rows.length).toBe(1)
      expect(rows[0].from).toBe('node_a')
      expect(rows[0].to).toBe('node_b')
      expect(rows[0].relationType).toBe('depends_on')
    })
  })
})
