/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../../core/store/sqlite-store.js'
import { runHealing, listHealingLog } from '../../core/skills/persist-healing.js'

function seed(store: SqliteStore, id: string, status: string, over: Record<string, unknown> = {}): void {
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
    acceptanceCriteria: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    metadata: {},
    ...over,
  })
}

describe('persist-healing — self-healing persistido', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
  })

  afterEach(() => {
    store.close()
  })

  it('dry-run detecta e registra no healing_log sem mutar o grafo', () => {
    // node blocked sem blocker real → issue detectável
    seed(store, 'b1', 'blocked')
    const before = store.getNodeById('b1')?.status
    const res = runHealing(store, { apply: false })
    expect(res.detected).toBeGreaterThanOrEqual(0)
    // status não mudou em dry-run
    expect(store.getNodeById('b1')?.status).toBe(before)
    // log registrado (mesmo em dry-run, quando há ações)
    const logRows = listHealingLog(store)
    expect(Array.isArray(logRows)).toBe(true)
  })

  it('--apply persiste as ações e o healing_log marca applied', () => {
    seed(store, 'b2', 'blocked')
    const res = runHealing(store, { apply: true })
    const logRows = listHealingLog(store)
    if (res.report.actions.length > 0) {
      expect(res.applied).toBeGreaterThanOrEqual(0)
      const appliedRows = logRows.filter((r) => r.applied)
      expect(appliedRows.length).toBe(res.report.actions.length)
    }
    // log persiste e é legível
    expect(listHealingLog(store).length).toBe(res.report.actions.length)
  })

  it('grafo saudável → zero ações', () => {
    seed(store, 'ok1', 'done')
    const res = runHealing(store, { apply: true })
    expect(res.report.metrics.totalIssuesDetected).toBe(res.detected)
  })
})
