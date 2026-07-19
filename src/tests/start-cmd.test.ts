/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, vi } from 'vitest'
import {
  startTaskPipeline,
  buildStartDeps,
  buildRecentWorkMemoryItems,
  type StartDeps,
} from '../cli/commands/start-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

describe('startTaskPipeline', () => {
  const mockDeps: StartDeps = {
    wakeUp: () => '## Wake-Up Pack\ncontext',
    findNext: () => ({ id: 'task-1', title: 'Do something', reason: 'high priority' }),
    loadContext: () => 'task context data',
    markInProgress: (id: string) => id,
    countInProgress: () => 0,
    out: () => {},
  }

  it('runs full pipeline returning task info', () => {
    const result = startTaskPipeline(mockDeps)
    expect(result.taskId).toBe('task-1')
    expect(result.title).toBe('Do something')
  })

  it('includes wake-up pack in context', () => {
    const result = startTaskPipeline(mockDeps)
    expect(result.context).toContain('task context data')
  })

  it('handles no next task gracefully', () => {
    const deps: StartDeps = {
      ...mockDeps,
      findNext: () => null,
    }
    const result = startTaskPipeline(deps)
    expect(result.taskId).toBeNull()
    expect(result.title).toBeNull()
  })

  it('blocks start when WIP >= 1', () => {
    const deps: StartDeps = {
      ...mockDeps,
      countInProgress: () => 1,
    }
    const result = startTaskPipeline(deps)
    expect(result.taskId).toBeNull()
    expect(result.title).toBeNull()
    expect(result.code).toBe('WIP_EXCEEDED')
  })

  it('allows start when WIP == 0', () => {
    const deps: StartDeps = {
      ...mockDeps,
      countInProgress: () => 0,
    }
    const result = startTaskPipeline(deps)
    expect(result.taskId).toBe('task-1')
    expect(result.title).toBe('Do something')
  })

  it('does not call markInProgress when WIP >= 1', () => {
    const markSpy = vi.fn()
    const deps: StartDeps = {
      ...mockDeps,
      countInProgress: () => 2,
      markInProgress: markSpy,
    }
    startTaskPipeline(deps)
    expect(markSpy).not.toHaveBeenCalled()
  })

  it('does not call findNext when WIP >= 1', () => {
    const findSpy = vi.fn(() => null)
    const deps: StartDeps = {
      ...mockDeps,
      countInProgress: () => 1,
      findNext: findSpy,
    }
    startTaskPipeline(deps)
    expect(findSpy).not.toHaveBeenCalled()
  })

  it('returns NEEDS_DECOMPOSE and does not mark in_progress for an XS task with no AC', () => {
    const markSpy = vi.fn()
    const deps: StartDeps = {
      ...mockDeps,
      findNext: () => ({ id: 'task-2', title: 'Vague XS task', reason: 'unblocked', xpSize: 'XS', acCount: 0 }),
      markInProgress: markSpy,
    }
    const result = startTaskPipeline(deps)
    expect(result.taskId).toBeNull()
    expect(result.code).toBe('NEEDS_DECOMPOSE')
    expect(markSpy).not.toHaveBeenCalled()
    expect(result.suggestions?.[0]?.cmd).toBe('agf decompose task-2')
  })

  it('starts normally when task is XS but has acceptance criteria', () => {
    const deps: StartDeps = {
      ...mockDeps,
      findNext: () => ({ id: 'task-3', title: 'XS with AC', reason: 'unblocked', xpSize: 'XS', acCount: 2 }),
    }
    const result = startTaskPipeline(deps)
    expect(result.taskId).toBe('task-3')
    expect(result.code).toBeUndefined()
  })

  it('starts normally when task has no AC but is not XS', () => {
    const deps: StartDeps = {
      ...mockDeps,
      findNext: () => ({ id: 'task-4', title: 'M with no AC', reason: 'unblocked', xpSize: 'M', acCount: 0 }),
    }
    const result = startTaskPipeline(deps)
    expect(result.taskId).toBe('task-4')
    expect(result.code).toBeUndefined()
  })

  it('buildStartDeps countInProgress reads store stats', () => {
    const mockStore = {
      getStats: () => ({
        totalNodes: 100,
        totalEdges: 200,
        byStatus: { backlog: 50, ready: 10, in_progress: 3, done: 40 },
      }),
      toGraphDocument: () => ({}),
      updateNodeStatus: () => {},
      close: () => {},
    } as unknown as import('../../core/store/sqlite-store.js').SqliteStore
    const deps = buildStartDeps(mockStore, () => {})
    expect(deps.countInProgress()).toBe(3)
  })

  it('buildStartDeps wakeUp prepends an L0 identity block (node_wire_6362b102fac4)', () => {
    const mockStore = {
      getStats: () => ({
        totalNodes: 100,
        totalEdges: 200,
        byStatus: { backlog: 50, ready: 10, in_progress: 3, done: 40 },
      }),
      getProject: () => ({ id: 'proj-1', name: 'my-project' }),
      getNodesByStatus: () => [],
      toGraphDocument: () => ({}),
      updateNodeStatus: () => {},
      getDb: () => ({ prepare: () => ({ get: () => undefined }) }),
      close: () => {},
    } as unknown as import('../../core/store/sqlite-store.js').SqliteStore
    const deps = buildStartDeps(mockStore, () => {})
    const pack = deps.wakeUp()

    expect(pack).toContain('[L0]')
    expect(pack).toContain('my-project')
    expect(pack).toContain('## Wake-Up')
    expect(pack).toContain('100 nodes')
  })

  it('buildStartDeps wakeUp does NOT include a preflight warning when harness_history is healthy (>=70)', async () => {
    const { SqliteStore } = await import('../core/store/sqlite-store.js')
    const store = SqliteStore.open(':memory:')
    store.initProject('preflight-test')
    store
      .getDb()
      .prepare(
        `INSERT INTO harness_history (id, project_id, score, grade, breakdown, git_commit, timestamp)
         VALUES ('h1', (SELECT id FROM projects LIMIT 1), 85, 'A', '{}', NULL, ?)`,
      )
      .run(new Date().toISOString())

    const deps = buildStartDeps(store, () => {})
    const pack = deps.wakeUp()
    store.close()

    expect(pack).not.toContain('⚠️')
  })

  it('buildStartDeps wakeUp includes a preflight warning when harness_history is below grade B (node_wire_af5f9d25634b)', async () => {
    const { SqliteStore } = await import('../core/store/sqlite-store.js')
    const store = SqliteStore.open(':memory:')
    store.initProject('preflight-test')
    store
      .getDb()
      .prepare(
        `INSERT INTO harness_history (id, project_id, score, grade, breakdown, git_commit, timestamp)
         VALUES ('h1', (SELECT id FROM projects LIMIT 1), 50, 'D', '{}', NULL, ?)`,
      )
      .run(new Date().toISOString())

    const deps = buildStartDeps(store, () => {})
    const pack = deps.wakeUp()
    store.close()

    expect(pack).toContain('⚠️')
    expect(pack).toContain('grade D')
  })

  it('buildStartDeps wakeUp appends an L1 essential block from recent high-priority done work (node_wire_a3471c706441)', () => {
    const doneNode = {
      id: 'node_done_1',
      type: 'task',
      title: 'Ship the checkout flow',
      status: 'done',
      priority: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as GraphNode
    const mockStore = {
      getStats: () => ({
        totalNodes: 100,
        totalEdges: 200,
        byStatus: { backlog: 50, ready: 10, in_progress: 3, done: 40 },
      }),
      getProject: () => ({ id: 'proj-1', name: 'my-project' }),
      getNodesByStatus: (status: string) => (status === 'done' ? [doneNode] : []),
      toGraphDocument: () => ({}),
      updateNodeStatus: () => {},
      getDb: () => ({ prepare: () => ({ get: () => undefined }) }),
      close: () => {},
    } as unknown as import('../../core/store/sqlite-store.js').SqliteStore
    const deps = buildStartDeps(mockStore, () => {})
    const pack = deps.wakeUp()

    expect(pack).toContain('[L1')
    expect(pack).toContain('Ship the checkout flow')
  })

  it('buildStartDeps wakeUp omits the L1 block when there is no recent hot work', () => {
    const mockStore = {
      getStats: () => ({
        totalNodes: 100,
        totalEdges: 200,
        byStatus: { backlog: 50, ready: 10, in_progress: 3, done: 40 },
      }),
      getProject: () => ({ id: 'proj-1', name: 'my-project' }),
      getNodesByStatus: () => [],
      toGraphDocument: () => ({}),
      updateNodeStatus: () => {},
      getDb: () => ({ prepare: () => ({ get: () => undefined }) }),
      close: () => {},
    } as unknown as import('../../core/store/sqlite-store.js').SqliteStore
    const deps = buildStartDeps(mockStore, () => {})
    const pack = deps.wakeUp()

    expect(pack).not.toContain('[L1')
  })
})

describe('buildRecentWorkMemoryItems', () => {
  const makeDoneNode = (overrides: Partial<GraphNode> & { id: string }): GraphNode =>
    ({
      type: 'task',
      title: 'a done task',
      status: 'done',
      priority: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    }) as GraphNode

  it('maps priority to a retention-eligible score (1=highest -> 1.0)', () => {
    const items = buildRecentWorkMemoryItems([makeDoneNode({ id: 'n1', priority: 1 })])
    expect(items[0]?.score).toBe(1)
  })

  it('maps low priority to a lower score (5=lowest -> 0.2)', () => {
    const items = buildRecentWorkMemoryItems([makeDoneNode({ id: 'n1', priority: 5 })])
    expect(items[0]?.score).toBeCloseTo(0.2)
  })

  it('sorts by most recently updated first', () => {
    const older = makeDoneNode({ id: 'old', updatedAt: new Date(Date.now() - 86_400_000 * 5).toISOString() })
    const newer = makeDoneNode({ id: 'new', updatedAt: new Date().toISOString() })
    const items = buildRecentWorkMemoryItems([older, newer])
    expect(items[0]?.id).toBe('new')
    expect(items[1]?.id).toBe('old')
  })

  it('computes ageDays from updatedAt', () => {
    const fiveDaysAgo = new Date(Date.now() - 86_400_000 * 5).toISOString()
    const items = buildRecentWorkMemoryItems([makeDoneNode({ id: 'n1', updatedAt: fiveDaysAgo })])
    expect(items[0]?.ageDays).toBeGreaterThanOrEqual(4.9)
    expect(items[0]?.ageDays).toBeLessThanOrEqual(5.1)
  })

  it('caps the number of items to the given limit', () => {
    const nodes = Array.from({ length: 20 }, (_, i) => makeDoneNode({ id: `n${i}` }))
    const items = buildRecentWorkMemoryItems(nodes, 5)
    expect(items).toHaveLength(5)
  })
})

describe('start command registration', () => {
  it('exports startCommand function', async () => {
    const mod = await import('../cli/commands/start-cmd.js')
    expect(typeof mod.startCommand).toBe('function')
  })
})
