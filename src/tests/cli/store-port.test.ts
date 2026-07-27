/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../../core/store/sqlite-store.js'
import { makeStorePort } from '../../cli/shared/store-port.js'

function seed(store: SqliteStore, over: { id: string; title: string; status?: string }): void {
  store.insertNode({
    id: over.id,
    type: 'task',
    title: over.title,
    description: '',
    status: (over.status ?? 'backlog') as never,
    priority: 3,
    xpSize: 'S',
    parentId: null,
    acceptanceCriteria: [],
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: {},
  })
}

describe('store-port — makeStorePort', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
  })

  afterEach(() => {
    store.close()
  })

  it('nextTask retorna a task desbloqueada de maior prioridade', () => {
    seed(store, { id: 't1', title: 'Primeira', status: 'ready' })
    seed(store, { id: 't2', title: 'Segunda', status: 'backlog' })
    const port = makeStorePort(store)
    const task = port.nextTask()
    expect(task).not.toBeNull()
    if (task && 'id' in task) {
      expect(task.id).toBe('t1')
    }
  })

  it('nextTask retorna null quando não há tasks prontas', () => {
    const port = makeStorePort(store)
    expect(port.nextTask()).toBeNull()
  })

  it('markInProgress atualiza status da task', () => {
    seed(store, { id: 't1', title: 'Task', status: 'ready' })
    const port = makeStorePort(store)
    port.markInProgress('t1')
    const node = store.getNodeById('t1')
    expect(node?.status).toBe('in_progress')
  })

  it('markDone atualiza status para done', () => {
    seed(store, { id: 't1', title: 'Task', status: 'in_progress' })
    const port = makeStorePort(store)
    port.markDone('t1')
    const node = store.getNodeById('t1')
    expect(node?.status).toBe('done')
  })

  it('checkDone retorna readiness sem required failed para task completa', () => {
    seed(store, { id: 't1', title: 'Task', status: 'in_progress' })
    store.updateNode('t1', { acceptanceCriteria: ['AC1'] })
    const port = makeStorePort(store)
    const result = port.checkDone('t1')
    expect(result).toHaveProperty('ready')
    expect(Array.isArray(result.failedRequired)).toBe(true)
  })
})
