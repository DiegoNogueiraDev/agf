import { describe, it, expect, beforeEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { buildWelcomeSummary } from '../cli/commands/welcome-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function addTask(store: SqliteStore, id: string): void {
  store.insertNode({
    id,
    type: 'task',
    title: `Task ${id}`,
    status: 'backlog',
    priority: 3,
    blocked: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as GraphNode)
}

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('Test')
  return store
}

describe('buildWelcomeSummary', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = makeStore()
  })

  it('includes stats summary', () => {
    const result = buildWelcomeSummary(store)
    expect(result.stats).toBeDefined()
    expect(typeof result.stats.totalNodes).toBe('number')
  })

  it('includes skill orientation with planner and builder', () => {
    const result = buildWelcomeSummary(store)
    expect(result.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'graph-backlog-generation' }),
        expect.objectContaining({ name: 'graph-builder-leafcutter' }),
      ]),
    )
  })

  it('includes next task or null when no tasks', () => {
    const result = buildWelcomeSummary(store)
    // empty graph — no tasks
    expect(result.next).toBeNull()
  })

  it('next.id equals the unblocked task id when one exists', () => {
    addTask(store, 'task-abc')
    const result = buildWelcomeSummary(store)
    expect(result.next).not.toBeNull()
    expect(result.next!.id).toBe('task-abc')
  })

  it('honors --select via envelope key presence', () => {
    const result = buildWelcomeSummary(store)
    expect(result).toHaveProperty('stats')
    expect(result).toHaveProperty('skills')
    expect(result).toHaveProperty('next')
  })
})
