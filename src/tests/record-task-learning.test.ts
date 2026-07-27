/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §node_1cb18d2e56e7 — learning-on-done: a completed task appends exactly one
 * PerfRecord so `agf learning` is fed by the loop (no longer dead/empty).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { SqliteLearningStore } from '../core/learning/sqlite-learning-store.js'
import { recordTaskLearning } from '../core/learning/record-task-learning.js'

describe('recordTaskLearning (#node_1cb18d2e56e7)', () => {
  let dir: string
  let store: SqliteStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-learn-'))
    store = SqliteStore.open(dir)
    store.initProject('learn-test')
  })
  afterEach(() => {
    store.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('appends exactly one PerfRecord for a completed task', () => {
    recordTaskLearning(store, { nodeId: 'task-1', acPassed: true, cycleTimeMs: 1200 })
    const records = new SqliteLearningStore(store).readAll()
    expect(records).toHaveLength(1)
    expect(records[0].nodeId).toBe('task-1')
    expect(records[0].acPassed).toBe(true)
    expect(records[0].cycleTimeMs).toBe(1200)
    expect(records[0].agentId).toBeTruthy()
  })

  it('defaults agentId to "local" and harnessDelta to 0', () => {
    recordTaskLearning(store, { nodeId: 'task-2', acPassed: false })
    const r = new SqliteLearningStore(store).readAll()[0]
    expect(r.agentId).toBe('local')
    expect(r.harnessDelta).toBe(0)
    expect(r.acPassed).toBe(false)
  })

  it('honours an explicit agentId', () => {
    recordTaskLearning(store, { nodeId: 'task-3', acPassed: true, agentId: 'sonnet-4-6' })
    expect(new SqliteLearningStore(store).readAll()[0].agentId).toBe('sonnet-4-6')
  })
})
