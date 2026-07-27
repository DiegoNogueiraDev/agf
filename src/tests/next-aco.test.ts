import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { findUnblockedTasks } from '../core/planner/next-task.js'
import { depositPheromone, getAggregatedTagPheromone } from '../core/economy/pheromone-store.js'
import { pheromoneWeightedSelect } from '../core/colony/pheromone-weighted-select.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('test-aco')
  return store
}

function addTask(store: SqliteStore, id: string, priority: number, tags: string[] = [], size = 'M'): void {
  store.insertNode({
    id,
    type: 'task',
    title: `Task ${id}`,
    status: 'backlog',
    priority,
    xpSize: size,
    tags,
    blocked: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as GraphNode)
}

describe('findUnblockedTasks', () => {
  it('returns all unblocked backlog tasks', () => {
    const store = makeStore()
    addTask(store, 'a', 1, ['aco'])
    addTask(store, 'b', 2, ['pheromone'])
    addTask(store, 'c', 3, ['testing'])
    const candidates = findUnblockedTasks(store.toGraphDocument())
    store.close()
    expect(candidates.length).toBe(3)
  })

  it('excludes done nodes', () => {
    const store = makeStore()
    addTask(store, 'a', 1)
    store.insertNode({
      id: 'b',
      type: 'task',
      title: 'Task b',
      status: 'done',
      priority: 2,
      blocked: false,
      createdAt: '',
      updatedAt: '',
    } as GraphNode)
    const candidates = findUnblockedTasks(store.toGraphDocument())
    store.close()
    expect(candidates.length).toBe(1)
    expect(candidates[0]!.id).toBe('a')
  })

  it('excludes explicitly blocked tasks', () => {
    const store = makeStore()
    addTask(store, 'a', 1)
    store.insertNode({
      id: 'blocked-task',
      type: 'task',
      title: 'blocked',
      status: 'backlog',
      priority: 1,
      blocked: true,
      createdAt: '',
      updatedAt: '',
    } as GraphNode)
    const candidates = findUnblockedTasks(store.toGraphDocument())
    store.close()
    expect(candidates.every((c) => !c.blocked)).toBe(true)
  })

  it('returns empty array when graph has no eligible tasks', () => {
    const store = makeStore()
    const candidates = findUnblockedTasks(store.toGraphDocument())
    store.close()
    expect(candidates).toEqual([])
  })
})

describe('getAggregatedTagPheromone', () => {
  it('returns 0 when no trails exist', () => {
    const store = makeStore()
    const { id: projectId } = store.getProject()!
    const db = store.getDb()
    const result = getAggregatedTagPheromone(db, projectId, ['aco', 'pheromone'])
    store.close()
    expect(result).toBe(0)
  })

  it('sums strengths of trails matching any tag', () => {
    const store = makeStore()
    const { id: projectId } = store.getProject()!
    const db = store.getDb()
    depositPheromone(db, projectId, 'dimension:tests:pattern:aco', 2)
    depositPheromone(db, projectId, 'dimension:docs:pattern:pheromone', 3)
    depositPheromone(db, projectId, 'dimension:types:pattern:unrelated', 5)
    const strength = getAggregatedTagPheromone(db, projectId, ['aco', 'pheromone'])
    store.close()
    // Should sum 2+3 for matching tags, exclude 'unrelated'
    expect(strength).toBeGreaterThan(4)
    expect(strength).toBeLessThan(5.1)
  })

  it('returns 0 for empty tags array', () => {
    const store = makeStore()
    const { id: projectId } = store.getProject()!
    const db = store.getDb()
    depositPheromone(db, projectId, 'dimension:tests:pattern:aco', 1)
    const result = getAggregatedTagPheromone(db, projectId, [])
    store.close()
    expect(result).toBe(0)
  })
})

// AC2: agf next --aco reads τ and uses roulette — integration
describe('ACO selection integration (--aco path)', () => {
  it('high-pheromone task wins over higher-priority task with alpha=1', () => {
    const store = makeStore()
    const { id: projectId } = store.getProject()!
    const db = store.getDb()
    addTask(store, 'high-pri', 1, ['testing']) // priority 1, no pheromone trail
    addTask(store, 'low-pri', 3, ['aco']) // priority 3, strong trail
    depositPheromone(db, projectId, 'dimension:tests:pattern:aco', 100)
    const candidates = findUnblockedTasks(store.toGraphDocument())
    const withPheromone = candidates.map((c) => ({
      id: c.id,
      priority: c.priority,
      size: 1,
      pheromone: getAggregatedTagPheromone(db, projectId, c.tags ?? []),
    }))
    store.close()

    // rng=0 → highest combined score; 'low-pri' has pheromone=100, 'high-pri' has 0
    const selected = pheromoneWeightedSelect(withPheromone, { alpha: 1, beta: 1 }, () => 0)
    expect(selected?.id).toBe('low-pri')
  })

  // AC1: default (no --aco) is byte-identical — guaranteed by not changing findNextTask
  it('with alpha=0 (no pheromone influence) rng=0 picks highest priority', () => {
    const store = makeStore()
    const { id: projectId } = store.getProject()!
    const db = store.getDb()
    addTask(store, 'p1', 1, ['testing'])
    addTask(store, 'p3', 3, ['aco'])
    depositPheromone(db, projectId, 'dimension:tests:pattern:aco', 100) // trail irrelevant at alpha=0
    const candidates = findUnblockedTasks(store.toGraphDocument())
    const withPheromone = candidates.map((c) => ({
      id: c.id,
      priority: c.priority,
      size: 1,
      pheromone: getAggregatedTagPheromone(db, projectId, c.tags ?? []),
    }))
    store.close()

    const selected = pheromoneWeightedSelect(withPheromone, { alpha: 0, beta: 1 }, () => 0)
    expect(selected?.id).toBe('p1')
  })
})
