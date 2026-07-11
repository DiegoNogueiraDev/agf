/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_4a2a016284cb — ACO strict-priority default (--no-aco as default,
 * roulette opt-in). The bug: `agf next` (ACO roulette) ignored strict
 * priority — it pulled a priority-3 task before a priority-2 one, because
 * `resolveAcoMode({})` defaulted to 'auto', and 'auto' triggers the roulette
 * whenever the pheromone field is informative (any trail > 0), regardless of
 * priority. Fix: flip the default to 'off' — deterministic priority sort is
 * now the safe default; roulette requires the explicit `--aco` flag.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { depositPheromone } from '../core/economy/pheromone-store.js'
import { makeSeededPrng } from '../core/utils/seeded-prng.js'
import { selectNextTaskSmart } from '../core/planner/aco-select.js'
import { resolveAcoMode } from '../core/planner/aco-mode.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('test-aco-priority-default')
  return store
}

function addTask(store: SqliteStore, id: string, priority: number, tags: string[] = []): void {
  store.insertNode({
    id,
    type: 'task',
    title: `Task ${id}`,
    status: 'backlog',
    priority,
    xpSize: 'M',
    tags,
    blocked: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as GraphNode)
}

describe('resolveAcoMode — strict priority is the default', () => {
  it('GIVEN no --aco and no --no-aco flags THEN the result is "off"', () => {
    expect(resolveAcoMode({})).toBe('off')
  })

  it('GIVEN --aco THEN the result is "on" (roulette is explicitly opt-in)', () => {
    expect(resolveAcoMode({ aco: true })).toBe('on')
  })

  it('GIVEN --no-aco THEN the result is "off" (explicit override, same as new default)', () => {
    expect(resolveAcoMode({ noAco: true })).toBe('off')
  })
})

describe('selectNextTaskSmart — default mode selects strict priority even with an informative pheromone field', () => {
  it('GIVEN a priority-1 and a priority-3 candidate WHEN mode is off (the new default) THEN priority-1 is selected, never the roulette', () => {
    const store = makeStore()
    const projectId = store.getProject()!.id
    const db = store.getDb()
    addTask(store, 'p3', 3, ['x'])
    addTask(store, 'p1', 1, ['x'])
    // Strongly favor the priority-3 task's tag so a roulette pick WOULD choose it —
    // proving the fix isn't a coincidence of a cold field.
    depositPheromone(db, projectId, 'x', 10)

    const mode = resolveAcoMode({})
    expect(mode).toBe('off')

    const res = selectNextTaskSmart(store.toGraphDocument(), {
      getDb: () => db,
      getProjectId: () => projectId,
      mode,
      rng: makeSeededPrng(1),
    })
    store.close()

    expect(res).not.toBeNull()
    expect(res!.node.id).toBe('p1')
    expect(res!.reason).not.toBe('aco-roulette')
  })
})
