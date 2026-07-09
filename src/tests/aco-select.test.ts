import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { depositPheromone, getAggregatedTagPheromone } from '../core/economy/pheromone-store.js'
import { readSelectionEpisodes } from '../core/economy/selection-quality.js'
import { makeSeededPrng } from '../core/utils/seeded-prng.js'
import { selectNextTaskSmart } from '../core/planner/aco-select.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('test-aco-select')
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

describe('selectNextTaskSmart — records a selection-episode on every considered pick (smart-default)', () => {
  // AC: even when the field is cold and ACO falls back to the deterministic sort, an episode
  // is recorded (target = the returned node) so the GA has data to learn from (self-priming).
  it('records an episode on a deterministic fallback pick (cold field)', () => {
    const store = makeStore()
    const projectId = store.getProject()!.id
    const db = store.getDb()
    addTask(store, 'p1', 1, ['x'])
    addTask(store, 'p2', 2, ['y'])
    // No pheromone deposited → cold field → deterministic fallback.
    const res = selectNextTaskSmart(store.toGraphDocument(), {
      getDb: () => db,
      getProjectId: () => projectId,
      mode: 'auto',
      rng: makeSeededPrng(1),
    })
    const episodes = readSelectionEpisodes(db, projectId)
    store.close()
    expect(res).not.toBeNull()
    expect(episodes).toHaveLength(1)
    expect(episodes[0].targetId).toBe(res!.node.id) // target = the actual pick
    expect(episodes[0].candidates.length).toBeGreaterThanOrEqual(2)
  })

  it('records no episode when ACO is explicitly off (--no-aco)', () => {
    const store = makeStore()
    const projectId = store.getProject()!.id
    const db = store.getDb()
    addTask(store, 'p1', 1, ['x'])
    selectNextTaskSmart(store.toGraphDocument(), {
      getDb: () => db,
      getProjectId: () => projectId,
      mode: 'off',
      rng: makeSeededPrng(1),
    })
    const episodes = readSelectionEpisodes(db, projectId)
    store.close()
    expect(episodes).toHaveLength(0)
  })
})

describe('selectNextTaskSmart — ACS local decay (T3/AC2)', () => {
  // AC: a just-picked trail decays locally so the colony keeps exploring.
  it('decays the chosen trail after an ACO pick', () => {
    const store = makeStore()
    const projectId = store.getProject()!.id
    const db = store.getDb()
    addTask(store, 'p2', 2, ['hot'])
    depositPheromone(db, projectId, 'hot', 5.0)
    const before = getAggregatedTagPheromone(db, projectId, ['hot'])
    const res = selectNextTaskSmart(store.toGraphDocument(), {
      getDb: () => db,
      getProjectId: () => projectId,
      mode: 'aco',
      rng: makeSeededPrng(1),
    })
    const after = getAggregatedTagPheromone(db, projectId, ['hot'])
    store.close()
    expect(res!.node.id).toBe('p2')
    expect(res!.reason).toBe('aco-roulette')
    expect(after).toBeLessThan(before) // local decay applied to the picked trail
  })
})

describe('selectNextTaskSmart', () => {
  // AC: --no-aco (mode off) → always deterministic, even with a strong trail
  it('mode "off" uses the deterministic sort even when the field is informative', () => {
    const store = makeStore()
    const projectId = store.getProject()!.id
    const db = store.getDb()
    addTask(store, 'p1', 1, ['x'])
    addTask(store, 'p3', 3, ['aco'])
    depositPheromone(db, projectId, 'pattern:aco', 100)
    const res = selectNextTaskSmart(store.toGraphDocument(), {
      getDb: () => db,
      getProjectId: () => projectId,
      mode: 'off',
      rng: makeSeededPrng(1),
    })
    store.close()
    expect(res).not.toBeNull()
    expect(res!.node.id).toBe('p1') // priority-1 deterministic winner
    expect(res!.reason).not.toContain('aco')
  })

  // AC: auto + cold/flat field → falls back to deterministic (no crash, no NO_TASKS)
  it('mode "auto" falls back to deterministic on a cold field', () => {
    const store = makeStore()
    const projectId = store.getProject()!.id
    const db = store.getDb()
    addTask(store, 'p1', 1, ['x'])
    addTask(store, 'p2', 2, ['aco'])
    const res = selectNextTaskSmart(store.toGraphDocument(), {
      getDb: () => db,
      getProjectId: () => projectId,
      mode: 'auto',
      rng: makeSeededPrng(1),
    })
    store.close()
    expect(res).not.toBeNull()
    expect(res!.node.id).toBe('p1')
    expect(res!.reason).not.toContain('aco')
  })

  // AC: auto + informative field → selects via ACO roulette
  it('mode "auto" selects via ACO when the field is informative', () => {
    const store = makeStore()
    const projectId = store.getProject()!.id
    const db = store.getDb()
    addTask(store, 'p1', 1, ['x'])
    addTask(store, 'p3', 3, ['aco'])
    depositPheromone(db, projectId, 'pattern:aco', 100)
    const res = selectNextTaskSmart(store.toGraphDocument(), {
      getDb: () => db,
      getProjectId: () => projectId,
      mode: 'auto',
      rng: makeSeededPrng(5),
    })
    store.close()
    expect(res).not.toBeNull()
    expect(res!.reason).toContain('aco')
  })

  // AC: explicit --aco (mode on) on a cold field → does not fail; falls back to deterministic
  it('mode "on" on a cold field falls back to a deterministic pick (never null when a task exists)', () => {
    const store = makeStore()
    const projectId = store.getProject()!.id
    const db = store.getDb()
    addTask(store, 'p1', 1, ['x'])
    const res = selectNextTaskSmart(store.toGraphDocument(), {
      getDb: () => db,
      getProjectId: () => projectId,
      mode: 'on',
      rng: makeSeededPrng(1),
    })
    store.close()
    expect(res).not.toBeNull()
    expect(res!.node.id).toBe('p1')
  })
})

describe('levyStep — Mantegna algorithm (node_658fa534bd65)', () => {
  it('is deterministic for a fixed seeded RNG (same sequence across 2 calls with fresh RNGs)', async () => {
    const { levyStep } = await import('../core/planner/aco-select.js')
    const seqA = [levyStep(1.5, 1.0, makeSeededPrng(42)), levyStep(1.5, 1.0, makeSeededPrng(42))]
    expect(seqA[0]).toBeCloseTo(seqA[1], 10)
  })

  it('returns a finite number for typical betaL/kappa ranges', async () => {
    const { levyStep } = await import('../core/planner/aco-select.js')
    const rand = makeSeededPrng(7)
    const step = levyStep(1.5, 1.0, rand)
    expect(Number.isFinite(step)).toBe(true)
  })
})

describe('selectNextTaskSmart — Lévy exploration branch (node_658fa534bd65)', () => {
  it('with levy() undefined (default), behaves identically to the existing roulette (zero regression)', () => {
    const store = makeStore()
    const projectId = store.getProject()!.id
    const db = store.getDb()
    addTask(store, 'p2', 2, ['hot'])
    depositPheromone(db, projectId, 'hot', 5.0)
    const res = selectNextTaskSmart(store.toGraphDocument(), {
      getDb: () => db,
      getProjectId: () => projectId,
      mode: 'aco',
      rng: makeSeededPrng(1),
    })
    store.close()
    expect(res!.node.id).toBe('p2')
    expect(res!.reason).toBe('aco-roulette')
  })

  it('with pLevy=1.0 (forced) and a seeded RNG that always returns 0, always takes the Lévy jump branch (reason=levy-jump)', () => {
    const store = makeStore()
    const projectId = store.getProject()!.id
    const db = store.getDb()
    addTask(store, 'p1', 1, ['a'])
    addTask(store, 'p2', 2, ['b'])
    addTask(store, 'p3', 3, ['c'])
    depositPheromone(db, projectId, 'a', 1.0)
    depositPheromone(db, projectId, 'b', 1.0)
    depositPheromone(db, projectId, 'c', 1.0)
    const alwaysZero = (): number => 0
    const res = selectNextTaskSmart(store.toGraphDocument(), {
      getDb: () => db,
      getProjectId: () => projectId,
      mode: 'aco',
      rng: alwaysZero,
      levy: () => ({ pLevy: 1.0, betaLevy: 1.5, kappa: 1.0 }),
    })
    store.close()
    expect(res).not.toBeNull()
    expect(res!.reason).toBe('levy-jump')
    expect(['p1', 'p2', 'p3']).toContain(res!.node.id)
  })
})
