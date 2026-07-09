/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../../core/store/sqlite-store.js'
import { SqliteLearningStore } from '../../core/learning/sqlite-learning-store.js'
import { actionStats } from '../../core/learning/learning-actions.js'

describe('SqliteLearningStore — learning persistido (perf_records)', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
  })

  afterEach(() => {
    store.close()
  })

  it('appendRecord persiste e readAll devolve (round-trip)', () => {
    const ls = new SqliteLearningStore(store)
    ls.appendRecord({ agentId: 'opus', nodeId: 'n1', harnessDelta: 2, acPassed: true, cycleTimeMs: 1200, ts: 1000 })
    ls.appendRecord({ agentId: 'opus', nodeId: 'n2', harnessDelta: 1, acPassed: false, cycleTimeMs: 800, ts: 2000 })
    const all = ls.readAll()
    expect(all.length).toBe(2)
    expect(all[0].agentId).toBe('opus')
  })

  it('actionStats agrega os registros persistidos', () => {
    const ls = new SqliteLearningStore(store)
    ls.appendRecord({ agentId: 'sonnet', nodeId: 'n1', harnessDelta: 3, acPassed: true, cycleTimeMs: 500, ts: 10 })
    ls.appendRecord({ agentId: 'sonnet', nodeId: 'n2', harnessDelta: 1, acPassed: true, cycleTimeMs: 700, ts: 20 })
    const stats = actionStats(ls)
    expect(stats.totalRecords).toBe(2)
    const agent = stats.agents.find((a) => a.agentId === 'sonnet')
    expect(agent).toBeDefined()
    expect(agent!.taskCount).toBe(2)
    expect(agent!.acPassRate).toBe(1)
  })

  it('replaceAll substitui atomicamente', () => {
    const ls = new SqliteLearningStore(store)
    ls.appendRecord({ agentId: 'a', nodeId: 'n1', harnessDelta: 0, acPassed: true, cycleTimeMs: 0, ts: 1 })
    ls.replaceAll([{ agentId: 'b', nodeId: 'n2', harnessDelta: 0, acPassed: true, cycleTimeMs: 0, ts: 2 }])
    const all = ls.readAll()
    expect(all.length).toBe(1)
    expect(all[0].agentId).toBe('b')
  })
})
