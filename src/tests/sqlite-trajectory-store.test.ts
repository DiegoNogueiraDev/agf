/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { SqliteTrajectoryStore } from '../core/learning/sqlite-trajectory-store.js'
import { storeTrajectory, recallSimilar, recallSuccessful } from '../core/learning/reasoning-bank.js'
import type { Trajectory } from '../core/learning/reasoning-bank.js'
import type { GraphNode } from '../core/graph/graph-types.js'

/** reasoning_trajectories.node_id REFERENCES nodes(id) — the referenced node must exist. */
function addTaskNode(store: SqliteStore, id: string): void {
  store.insertNode({
    id,
    type: 'task',
    title: `Task ${id}`,
    status: 'backlog',
    priority: 1,
    xpSize: 'M',
    tags: [],
    blocked: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as GraphNode)
}

function makeTrajectory(overrides: Partial<Trajectory> = {}): Trajectory {
  return {
    id: 't1',
    nodeId: 'n1',
    toolSequence: ['Read', 'Edit'],
    outcomeScore: 0.9,
    ts: 1000,
    ...overrides,
  }
}

describe('SqliteTrajectoryStore — ReasoningBank persistido (reasoning_trajectories)', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('test-project')
    addTaskNode(store, 'n1')
  })

  afterEach(() => {
    store.close()
  })

  it('insert + all round-trips a trajectory', () => {
    const ts = new SqliteTrajectoryStore(store)
    ts.insert(makeTrajectory())
    const all = ts.all()
    expect(all.length).toBe(1)
    expect(all[0]).toMatchObject({
      id: 't1',
      nodeId: 'n1',
      toolSequence: ['Read', 'Edit'],
      outcomeScore: 0.9,
    })
  })

  it('count reflects the number of persisted trajectories', () => {
    const ts = new SqliteTrajectoryStore(store)
    expect(ts.count()).toBe(0)
    ts.insert(makeTrajectory({ id: 't1' }))
    ts.insert(makeTrajectory({ id: 't2', ts: 2000 }))
    expect(ts.count()).toBe(2)
  })

  it('persists notes and survives being reopened against the same db', () => {
    const ts = new SqliteTrajectoryStore(store)
    ts.insert(makeTrajectory({ notes: 'worked well' }))
    const reopened = new SqliteTrajectoryStore(store)
    expect(reopened.all()[0].notes).toBe('worked well')
  })

  it('scopes rows to the store project — a second project sees nothing', () => {
    const ts = new SqliteTrajectoryStore(store)
    ts.insert(makeTrajectory())

    const other = SqliteStore.open(':memory:')
    other.initProject('other-project')
    addTaskNode(other, 'n1')
    const otherTs = new SqliteTrajectoryStore(other)
    expect(otherTs.count()).toBe(0)
    other.close()
  })

  it('works transparently with the pure reasoning-bank functions (storeTrajectory + recallSimilar)', () => {
    const ts = new SqliteTrajectoryStore(store)
    storeTrajectory(ts, makeTrajectory({ id: 't1', toolSequence: ['Read', 'Edit'], outcomeScore: 0.9 }))
    storeTrajectory(ts, makeTrajectory({ id: 't2', toolSequence: ['Bash'], outcomeScore: 0.2, ts: 2000 }))

    const matches = recallSimilar(ts, ['Read', 'Edit'], 5)
    expect(matches[0].trajectory.id).toBe('t1')
    expect(matches[0].similarity).toBe(1)

    const successful = recallSuccessful(ts, ['Read', 'Edit'], 0.5, 5)
    expect(successful.map((m) => m.trajectory.id)).toEqual(['t1'])
  })
})
