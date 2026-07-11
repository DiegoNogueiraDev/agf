/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../../core/store/sqlite-store.js'
import { RealTaskLifecycleService } from '../../core/services/task-lifecycle.js'
import { emitTaskHook } from '../../core/hooks/hook-runtime.js'
import { SqliteLearningStore } from '../../core/learning/sqlite-learning-store.js'

function seed(store: SqliteStore, id: string, status: string, ac: string[] = []): void {
  const now = new Date().toISOString()
  store.insertNode({
    id,
    type: 'task',
    title: `Task ${id}`,
    description: 'desc',
    status: status as never,
    priority: 3,
    xpSize: 'S',
    parentId: null,
    acceptanceCriteria: ac,
    tags: [],
    createdAt: now,
    updatedAt: now,
    metadata: {},
  })
}

const flush = (): Promise<void> => new Promise((r) => setImmediate(r))

describe('lifecycle hooks → learning persistence', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
    delete process.env.MCP_GRAPH_HOOKS_DISABLED
    delete process.env.AGF_HOOKS
  })

  afterEach(() => {
    store.close()
    delete process.env.MCP_GRAPH_HOOKS_DISABLED
    delete process.env.AGF_HOOKS
  })

  it('emitTaskHook(post-complete) persiste um PerfRecord em perf_records', async () => {
    seed(store, 'n1', 'in_progress')
    await emitTaskHook(store, 'task:post-complete', { nodeId: 'n1', title: 'Task n1' })
    const records = new SqliteLearningStore(store).readAll()
    expect(records.length).toBe(1)
    expect(records[0].nodeId).toBe('n1')
    expect(records[0].acPassed).toBe(true)
  })

  it('kill-switch AGF_HOOKS=0 → emit é no-op (não persiste)', async () => {
    process.env.AGF_HOOKS = '0'
    await emitTaskHook(store, 'task:post-complete', { nodeId: 'n1', title: 'x' })
    expect(new SqliteLearningStore(store).readAll().length).toBe(0)
  })

  it('finishTask de um node pronto dispara o hook e persiste (success)', async () => {
    seed(store, 'n2', 'in_progress', ['GIVEN x WHEN y THEN z'])
    const svc = new RealTaskLifecycleService(store)
    const report = svc.finishTask('n2')
    expect(report.ready).toBe(true)
    await flush()
    const records = new SqliteLearningStore(store).readAll()
    expect(records.length).toBe(1)
    expect(records[0].nodeId).toBe('n2')
  })

  it('finishTask de node sem AC dispara task:error e persiste failure', async () => {
    seed(store, 'n3', 'in_progress', []) // sem AC → DoD falha
    const svc = new RealTaskLifecycleService(store)
    const report = svc.finishTask('n3')
    expect(report.ready).toBe(false)
    await flush()
    const records = new SqliteLearningStore(store).readAll()
    expect(records.length).toBe(1)
    expect(records[0].acPassed).toBe(false)
  })
})
