/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { detectOrphanTasks } from '../core/analyzer/orphan-task-detector.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'

function createMockStore(
  nodes: Array<{
    id: string
    title: string
    type: string
    status: string
    sourceRef?: { file: string }
    testFiles?: string[]
  }>,
): SqliteStore {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'task',
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'backlog',
      priority INTEGER NOT NULL DEFAULT 3,
      parentId TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS edges (
      id TEXT PRIMARY KEY,
      from_node TEXT NOT NULL,
      to_node TEXT NOT NULL,
      relation_type TEXT NOT NULL DEFAULT 'related_to',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  const insertNode = db.prepare(
    'INSERT OR IGNORE INTO nodes (id, type, title, status, priority) VALUES (?, ?, ?, ?, 3)',
  )
  for (const n of nodes) {
    insertNode.run(n.id, n.type, n.title, n.status)
  }

  return {
    toGraphDocument: () => ({
      version: '1',
      project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as any,
        title: n.title,
        status: n.status as any,
        priority: 3 as const,
        sourceRef: n.sourceRef,
        testFiles: n.testFiles,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      edges: [],
      indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
      meta: { sourceFiles: [], lastImport: null },
    }),
    db,
  } as unknown as SqliteStore
}

describe('detectOrphanTasks', () => {
  it('returns empty array when no backlog/ready tasks exist', () => {
    const store = createMockStore([{ id: 't1', title: 'Done task', type: 'task', status: 'done' }])
    const result = detectOrphanTasks(store, '/tmp')
    expect(result).toEqual([])
  })

  it('returns empty array when no evidence found', () => {
    const store = createMockStore([{ id: 't1', title: 'New feature', type: 'task', status: 'backlog' }])
    const result = detectOrphanTasks(store, '/tmp')
    expect(result).toEqual([])
  })

  it('detects orphan by sourceRef file existence', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'orphan-'))
    const filePath = 'src/my-feature.ts'
    const fullPath = join(tmpDir, filePath)
    mkdirSync(join(tmpDir, 'src'), { recursive: true })
    writeFileSync(fullPath, 'export function myFeature() {}')
    const store = createMockStore([
      { id: 't1', title: 'My Feature', type: 'task', status: 'backlog', sourceRef: { file: filePath } },
    ])
    const result = detectOrphanTasks(store, tmpDir)
    expect(result.length).toBe(1)
    expect(result[0].nodeId).toBe('t1')
    expect(result[0].evidence.some((e) => e.type === 'file_exists')).toBe(true)
    expect(result[0].confidence).toBe(0.9)
    expect(result[0].suggestedAction).toBe('mark_done')
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('detects orphan by testFiles existence', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'orphan2-'))
    const testPath = 'src/tests/my-feature.test.ts'
    const fullPath = join(tmpDir, testPath)
    mkdirSync(join(tmpDir, 'src', 'tests'), { recursive: true })
    writeFileSync(fullPath, 'import { test } from "vitest"')
    const store = createMockStore([
      { id: 't1', title: 'My Feature', type: 'task', status: 'ready', testFiles: [testPath] },
    ])
    const result = detectOrphanTasks(store, tmpDir)
    expect(result.length).toBe(1)
    expect(result[0].evidence.some((e) => e.type === 'test_exists')).toBe(true)
    expect(result[0].confidence).toBe(0.85)
    expect(result[0].suggestedAction).toBe('mark_done')
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns review for low confidence evidence', () => {
    const store = createMockStore([
      { id: 't1', title: 'Vague Idea', type: 'task', status: 'backlog', sourceRef: { file: 'nonexistent.ts' } },
    ])
    const result = detectOrphanTasks(store, '/tmp')
    expect(result.length).toBe(0)
  })
})
