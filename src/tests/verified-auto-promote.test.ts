/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { verifyAndPromote } from '../core/utils/verified-auto-promote.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'
import type { TestGateResult } from '../core/harness/test-gate.js'

interface MockNode {
  id: string
  type: string
  title: string
  status: string
  parentId?: string | null
  sourceRefFile?: string | null
  testFiles?: string[]
}

function buildMockStore(nodes: MockNode[]): SqliteStore {
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
  const insert = db.prepare(
    'INSERT OR IGNORE INTO nodes (id, type, title, status, priority, parentId) VALUES (?, ?, ?, ?, 3, ?)',
  )
  for (const n of nodes) {
    insert.run(n.id, n.type, n.title, n.status, n.parentId ?? null)
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  return {
    db,
    toGraphDocument: () => ({
      version: '1',
      project: { id: 'p1', name: 'test', createdAt: '', updatedAt: '' },
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        status: n.status,
        priority: 3 as const,
        parentId: n.parentId ?? null,
        sourceRef: n.sourceRefFile ? { file: n.sourceRefFile } : undefined,
        testFiles: n.testFiles,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })) as GraphNode[],
      edges: [],
      indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
      meta: { sourceFiles: [], lastImport: null },
    }),
    getNodeById: (id: string) => {
      const raw = nodeMap.get(id)
      if (!raw) return null
      return {
        id: raw.id,
        type: raw.type,
        title: raw.title,
        status: raw.status,
        priority: 3 as const,
        parentId: raw.parentId ?? null,
        sourceRef: raw.sourceRefFile ? { file: raw.sourceRefFile } : undefined,
        testFiles: raw.testFiles,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as GraphNode
    },
    getChildNodes: (parentId: string) => {
      return nodes
        .filter((n) => n.parentId === parentId)
        .map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          status: n.status,
          priority: 3 as const,
          parentId: n.parentId ?? null,
          sourceRef: n.sourceRefFile ? { file: n.sourceRefFile } : undefined,
          testFiles: n.testFiles,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })) as GraphNode[]
    },
    updateNodeStatus: (id: string, status: string) => {
      const raw = nodeMap.get(id)
      if (!raw) return null
      raw.status = status
      return {
        id: raw.id,
        type: raw.type,
        title: raw.title,
        status: raw.status,
        priority: 3 as const,
        parentId: raw.parentId ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as GraphNode
    },
  } as unknown as SqliteStore
}

function passingGate(): Promise<TestGateResult> {
  return Promise.resolve({
    status: 'passed',
    blocked: false,
    passed: 3,
    failed: 0,
    errors: [],
    durationMs: 100,
    testFiles: ['test/file.test.ts'],
    mode: 'strict',
  })
}

function failingGate(): Promise<TestGateResult> {
  return Promise.resolve({
    status: 'failed',
    blocked: true,
    passed: 2,
    failed: 1,
    errors: [{ test: 'x.test.ts', name: 'should work', message: 'expected true to be false' }],
    durationMs: 100,
    testFiles: ['test/file.test.ts'],
    mode: 'strict',
  })
}

describe('verifyAndPromote', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vap-'))
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('promotes parent when all checks pass', async () => {
    const testFile = join(tmpDir, 'suite.test.ts')
    mkdirSync(join(tmpDir, 'test'), { recursive: true })
    writeFileSync(testFile, 'import { test } from "vitest"')

    const store = buildMockStore([
      { id: 'parent', type: 'epic', title: 'Epic', status: 'in_progress', testFiles: [testFile] },
      { id: 'child', type: 'task', title: 'Task', status: 'done', parentId: 'parent' },
    ])
    const result = await verifyAndPromote(store, 'child', {
      runTestGate: passingGate,
    })
    expect(result.promoted).toContain('parent')
    expect(result.rejected).toEqual([])
  })

  it('rejects parent when runTestGate fails', async () => {
    const testFile = join(tmpDir, 'suite.test.ts')
    mkdirSync(join(tmpDir, 'test'), { recursive: true })
    writeFileSync(testFile, 'import { test } from "vitest"')

    const store = buildMockStore([
      { id: 'parent', type: 'epic', title: 'Epic', status: 'in_progress', testFiles: [testFile] },
      { id: 'child', type: 'task', title: 'Task', status: 'done', parentId: 'parent' },
    ])
    const result = await verifyAndPromote(store, 'child', {
      runTestGate: failingGate,
    })
    expect(result.promoted).toEqual([])
    expect(result.rejected.length).toBe(1)
    expect(result.rejected[0].nodeId).toBe('parent')
    expect(result.rejected[0].reasons.some((r) => r.includes('tests failed'))).toBe(true)
  })

  it('rejects parent when no children done', async () => {
    const store = buildMockStore([
      { id: 'parent', type: 'epic', title: 'Epic', status: 'in_progress' },
      { id: 'child', type: 'task', title: 'Pending Task', status: 'in_progress', parentId: 'parent' },
    ])
    const result = await verifyAndPromote(store, 'child', {
      runTestGate: passingGate,
    })
    expect(result.promoted).toEqual([])
    expect(result.rejected).toEqual([])
  })

  it('stops at first ancestor that fails verification', async () => {
    const testFile = join(tmpDir, 'parent.test.ts')
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(testFile, 'import { test } from "vitest"')

    const store = buildMockStore([
      { id: 'gp', type: 'epic', title: 'Grandparent', status: 'in_progress', testFiles: [testFile] },
      { id: 'parent', type: 'epic', title: 'Parent', status: 'in_progress', parentId: 'gp', testFiles: [testFile] },
      { id: 'child', type: 'task', title: 'Child', status: 'done', parentId: 'parent' },
    ])
    const result = await verifyAndPromote(store, 'child', {
      runTestGate: failingGate,
    })
    expect(result.promoted).toEqual([])
    expect(result.rejected.length).toBe(1)
    expect(result.rejected[0].nodeId).toBe('parent')
  })

  it('returns empty when node has no parent', async () => {
    const store = buildMockStore([{ id: 'orphan', type: 'task', title: 'Orphan', status: 'done' }])
    const result = await verifyAndPromote(store, 'orphan', {
      runTestGate: passingGate,
    })
    expect(result.promoted).toEqual([])
    expect(result.rejected).toEqual([])
  })
})
