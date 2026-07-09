/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC Unified Hook Surface (finding ea0f86630c0e) — enforcement deny/halt
 * no updateNodeStatus via dispatchHookWithResult.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { _resetSharedHookBus } from '../core/hooks/shared-hook-bus.js'
import { _resetRegisteredHooks, registerHook } from '../core/hooks/register-hook.js'
import { deny } from '../core/hooks/hook-types.js'
import { StatusChangeDeniedError } from '../core/hooks/hook-types.js'

function makeStore(): SqliteStore {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('enforce-test')
  return store
}

/** Cria um node 'backlog' e retorna { id }. */
function seedNode(store: SqliteStore): { id: string } {
  const id = `task_${Math.abs(Date.parse('2026-06-17')).toString(36)}_${store.getAllNodes().length}`
  const ts = '2026-06-17T00:00:00.000Z'
  store.insertNode({
    id,
    type: 'task',
    title: 'T',
    status: 'backlog',
    priority: 3,
    blocked: false,
    createdAt: ts,
    updatedAt: ts,
  })
  return { id }
}

describe('status:pre-change enforcement', () => {
  beforeEach(() => {
    _resetRegisteredHooks()
    _resetSharedHookBus()
    delete process.env.AGF_HOOKS
  })
  afterEach(() => {
    _resetRegisteredHooks()
    _resetSharedHookBus()
  })

  it('byte-identical: with no handler, status change proceeds', () => {
    const store = makeStore()
    const node = seedNode(store)
    const updated = store.updateNodeStatus(node.id, 'in_progress')
    expect(updated?.status).toBe('in_progress')
    store.close()
  })

  it('a deny handler blocks the transition with a typed error + reason', () => {
    const store = makeStore()
    const node = seedNode(store)
    registerHook('status:pre-change', () => deny('frozen by policy'))
    expect(() => store.updateNodeStatus(node.id, 'in_progress')).toThrow(StatusChangeDeniedError)
    // estado não mudou
    expect(store.getNodeById(node.id)?.status).toBe('backlog')
    store.close()
  })

  it('AGF_HOOKS=0 bypasses enforcement (kill-switch)', () => {
    const store = makeStore()
    const node = seedNode(store)
    registerHook('status:pre-change', () => deny('x'))
    process.env.AGF_HOOKS = '0'
    expect(store.updateNodeStatus(node.id, 'in_progress')?.status).toBe('in_progress')
    store.close()
  })
})
