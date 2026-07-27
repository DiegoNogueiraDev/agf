/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Tests for pipeline compound commands.
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { nextContextCompound, nextStartCompound } from '../cli/commands/pipeline-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function createTestDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agf-pipeline-'))
  // pipeline commands use openStoreOrFail which expects a graph.db file
  // We need to create the DB file first
  return dir
}

function initStore(dir: string): SqliteStore {
  // openStoreOrFail (requireExisting) procura em <dir>/workflow-graph/graph.db —
  // o DB precisa morar nesse subdir, não na raiz do dir temporário.
  const storeDir = join(dir, 'workflow-graph')
  mkdirSync(storeDir, { recursive: true })
  const dbPath = join(storeDir, 'graph.db')
  const db = new Database(dbPath)
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('pipeline-test')
  return store
}

function seedTask(store: SqliteStore, overrides?: { status?: string; priority?: number }): string {
  const id = `task_${randomUUID().slice(0, 8)}`
  const ts = new Date().toISOString()
  store.insertNode({
    id,
    type: 'task',
    title: `Test Task ${id}`,
    status: overrides?.status ?? 'ready',
    priority: overrides?.priority ?? 3,
    description: 'Test description',
    createdAt: ts,
    updatedAt: ts,
  })
  return id
}

describe('pipeline compound commands', () => {
  it('pipeline command module exports pipelineCommand', async () => {
    const mod = await import('../cli/commands/pipeline-cmd.js')
    expect(typeof mod.pipelineCommand).toBe('function')
  })

  it('nextContextCompound returns null when no tasks available', () => {
    const dir = createTestDir()
    try {
      const store = initStore(dir)
      store.close()

      const result = nextContextCompound(dir, true)
      expect(result).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('nextContextCompound returns node and context for available task', () => {
    const dir = createTestDir()
    try {
      const store = initStore(dir)
      const taskId = seedTask(store, { status: 'ready' })
      store.close()

      const result = nextContextCompound(dir, true)
      expect(result).not.toBeNull()
      expect(result!.node.id).toBe(taskId)
      expect(result!.node.title).toContain('Test Task')
      expect(result!.reason).toBeTruthy()
      expect(result!.context).toBeDefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('nextStartCompound returns null when WIP exceeded', () => {
    const dir = createTestDir()
    try {
      const store = initStore(dir)
      seedTask(store, { status: 'in_progress' })
      seedTask(store, { status: 'ready' })
      store.close()

      const result = nextStartCompound(dir, true)
      expect(result).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('nextStartCompound marks task in_progress', () => {
    const dir = createTestDir()
    try {
      const store = initStore(dir)
      const taskId = seedTask(store, { status: 'ready' })
      store.close()

      const result = nextStartCompound(dir, true)
      expect(result).not.toBeNull()
      expect(result!.taskId).toBe(taskId)

      // Verify task was marked in_progress — reabre o store existente (sem re-init).
      const store2 = SqliteStore.open(dir)
      const node = store2.getNodeById(taskId)
      expect(node?.status).toBe('in_progress')
      store2.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
