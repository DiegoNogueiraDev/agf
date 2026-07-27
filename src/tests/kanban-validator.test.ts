/*!
 * Tests for kanban/kanban-validator.ts
 *
 * validateMove(store, nodeId, newStatus, config) — validates a card move.
 *   - Returns {success:false} when node not found.
 *   - Returns {success:true, warnings:[]} for a plain valid move.
 *   - Warns when moving to "done" with unresolved (non-done) dependencies.
 *   - Warns when the new status column is at or over its WIP limit.
 *   - Never blocks moves (advisory-only) — always success:true when node exists.
 *
 * Uses vi.fn() stubs for SqliteStore (getNodeById, getEdgesFrom, getNodesByStatus).
 */

import { describe, it, expect, vi } from 'vitest'
import { validateMove } from '../core/kanban/kanban-validator.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode, NodeStatus } from '../core/graph/graph-types.js'
import type { KanbanConfig } from '../core/kanban/kanban-types.js'
import { DEFAULT_KANBAN_CONFIG } from '../core/kanban/kanban-types.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const BASE_TIME = '2026-01-01T00:00:00.000Z'

function makeNode(overrides: Partial<GraphNode> & { id: string; status: NodeStatus }): GraphNode {
  return {
    title: 'task',
    type: 'task',
    priority: 3,
    parentId: null,
    createdAt: BASE_TIME,
    updatedAt: BASE_TIME,
    description: null,
    ...overrides,
  } as GraphNode
}

function makeStore(overrides: {
  getNodeById?: (id: string) => GraphNode | null
  getEdgesFrom?: (id: string) => Array<{ relationType: string; to: string }>
  getNodesByStatus?: (status: NodeStatus) => GraphNode[]
}): SqliteStore {
  return {
    getNodeById: vi.fn().mockImplementation(overrides.getNodeById ?? (() => null)),
    getEdgesFrom: vi.fn().mockReturnValue(overrides.getEdgesFrom ? [] : []),
    getNodesByStatus: vi.fn().mockReturnValue([]),
    ...(overrides.getEdgesFrom ? { getEdgesFrom: vi.fn().mockImplementation(overrides.getEdgesFrom) } : {}),
    ...(overrides.getNodesByStatus ? { getNodesByStatus: vi.fn().mockImplementation(overrides.getNodesByStatus) } : {}),
  } as unknown as SqliteStore
}

const NO_WIP_CONFIG: KanbanConfig = {
  ...DEFAULT_KANBAN_CONFIG,
  wipLimits: { backlog: 0, ready: 0, in_progress: 0, blocked: 0, done: 0 },
}

// ── node not found ────────────────────────────────────────────────────────────

describe('validateMove — node not found', () => {
  it('returns success=false when node is not in the store', () => {
    const store = makeStore({ getNodeById: () => null })
    const result = validateMove(store, 'missing', 'in_progress', NO_WIP_CONFIG)
    expect(result.success).toBe(false)
  })

  it('includes node id in returned node', () => {
    const store = makeStore({ getNodeById: () => null })
    const result = validateMove(store, 'ghost-id', 'in_progress', NO_WIP_CONFIG)
    expect(result.node.id).toBe('ghost-id')
  })

  it('returns a warning containing the node id', () => {
    const store = makeStore({ getNodeById: () => null })
    const result = validateMove(store, 'not-there', 'done', NO_WIP_CONFIG)
    expect(result.warnings.some((w) => w.includes('not-there'))).toBe(true)
  })

  it('sets newStatus in result even when node not found', () => {
    const store = makeStore({ getNodeById: () => null })
    const result = validateMove(store, 'x', 'done', NO_WIP_CONFIG)
    expect(result.newStatus).toBe('done')
  })
})

// ── valid move (no warnings) ──────────────────────────────────────────────────

describe('validateMove — valid move', () => {
  it('returns success=true when node exists', () => {
    const node = makeNode({ id: 'n1', status: 'backlog' })
    const store = makeStore({ getNodeById: () => node, getEdgesFrom: () => [] })
    const result = validateMove(store, 'n1', 'in_progress', NO_WIP_CONFIG)
    expect(result.success).toBe(true)
  })

  it('returns empty warnings for a plain valid move', () => {
    const node = makeNode({ id: 'n1', status: 'backlog' })
    const store = makeStore({ getNodeById: () => node, getEdgesFrom: () => [] })
    const result = validateMove(store, 'n1', 'in_progress', NO_WIP_CONFIG)
    expect(result.warnings).toHaveLength(0)
  })

  it('reflects previousStatus from node.status', () => {
    const node = makeNode({ id: 'n1', status: 'ready' })
    const store = makeStore({ getNodeById: () => node, getEdgesFrom: () => [] })
    const result = validateMove(store, 'n1', 'in_progress', NO_WIP_CONFIG)
    expect(result.previousStatus).toBe('ready')
  })

  it('reflects newStatus in result', () => {
    const node = makeNode({ id: 'n1', status: 'in_progress' })
    const store = makeStore({ getNodeById: () => node, getEdgesFrom: () => [] })
    const result = validateMove(store, 'n1', 'done', NO_WIP_CONFIG)
    expect(result.newStatus).toBe('done')
  })

  it('returns the original node in result', () => {
    const node = makeNode({ id: 'n1', status: 'backlog', title: 'my task' })
    const store = makeStore({ getNodeById: () => node, getEdgesFrom: () => [] })
    const result = validateMove(store, 'n1', 'ready', NO_WIP_CONFIG)
    expect(result.node).toBe(node)
  })
})

// ── done with unresolved deps ─────────────────────────────────────────────────

describe('validateMove — unresolved dependencies when moving to done', () => {
  it('warns when a depends_on dep is not done', () => {
    const node = makeNode({ id: 'n1', status: 'in_progress' })
    const dep = makeNode({ id: 'dep1', status: 'backlog', title: 'dep task' })
    const store = makeStore({
      getNodeById: (id) => (id === 'n1' ? node : dep),
      getEdgesFrom: () => [
        { relationType: 'depends_on', to: 'dep1', from: 'n1', id: 'e1', type: 'depends_on' } as never,
      ],
      getNodesByStatus: () => [],
    })
    const result = validateMove(store, 'n1', 'done', NO_WIP_CONFIG)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('warning message contains dep count', () => {
    const node = makeNode({ id: 'n1', status: 'in_progress' })
    const dep = makeNode({ id: 'dep1', status: 'in_progress', title: 'blocker' })
    const store = makeStore({
      getNodeById: (id) => (id === 'n1' ? node : dep),
      getEdgesFrom: () => [
        { relationType: 'depends_on', to: 'dep1', from: 'n1', id: 'e1', type: 'depends_on' } as never,
      ],
      getNodesByStatus: () => [],
    })
    const result = validateMove(store, 'n1', 'done', NO_WIP_CONFIG)
    expect(result.warnings[0]).toContain('1')
  })

  it('no warning when all deps are done', () => {
    const node = makeNode({ id: 'n1', status: 'in_progress' })
    const dep = makeNode({ id: 'dep1', status: 'done' })
    const store = makeStore({
      getNodeById: (id) => (id === 'n1' ? node : dep),
      getEdgesFrom: () => [
        { relationType: 'depends_on', to: 'dep1', from: 'n1', id: 'e1', type: 'depends_on' } as never,
      ],
      getNodesByStatus: () => [],
    })
    const result = validateMove(store, 'n1', 'done', NO_WIP_CONFIG)
    expect(result.warnings).toHaveLength(0)
  })

  it('does not check edges when moving to in_progress', () => {
    const node = makeNode({ id: 'n1', status: 'backlog' })
    const edgesFn = vi.fn().mockReturnValue([])
    const store = {
      getNodeById: vi.fn().mockReturnValue(node),
      getEdgesFrom: edgesFn,
      getNodesByStatus: vi.fn().mockReturnValue([]),
    } as unknown as SqliteStore
    validateMove(store, 'n1', 'in_progress', NO_WIP_CONFIG)
    expect(edgesFn).not.toHaveBeenCalled()
  })

  it('still success=true even with unresolved deps (advisory mode)', () => {
    const node = makeNode({ id: 'n1', status: 'in_progress' })
    const dep = makeNode({ id: 'dep1', status: 'blocked', title: 'blocked dep' })
    const store = makeStore({
      getNodeById: (id) => (id === 'n1' ? node : dep),
      getEdgesFrom: () => [
        { relationType: 'depends_on', to: 'dep1', from: 'n1', id: 'e1', type: 'depends_on' } as never,
      ],
      getNodesByStatus: () => [],
    })
    const result = validateMove(store, 'n1', 'done', NO_WIP_CONFIG)
    expect(result.success).toBe(true)
  })
})

// ── WIP limit warnings ────────────────────────────────────────────────────────

describe('validateMove — WIP limit warnings', () => {
  it('warns when moving to a status that would exceed WIP limit', () => {
    const node = makeNode({ id: 'n1', status: 'ready' })
    const existing = makeNode({ id: 'e1', status: 'in_progress', type: 'task' })
    const config: KanbanConfig = {
      ...NO_WIP_CONFIG,
      wipLimits: { ...NO_WIP_CONFIG.wipLimits, in_progress: 1 },
    }
    const store = makeStore({
      getNodeById: () => node,
      getEdgesFrom: () => [],
      getNodesByStatus: () => [existing],
    })
    const result = validateMove(store, 'n1', 'in_progress', config)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('no WIP warning when limit is 0 (disabled)', () => {
    const node = makeNode({ id: 'n1', status: 'ready' })
    const existing = [makeNode({ id: 'e1', status: 'in_progress' }), makeNode({ id: 'e2', status: 'in_progress' })]
    const store = makeStore({
      getNodeById: () => node,
      getEdgesFrom: () => [],
      getNodesByStatus: () => existing,
    })
    const result = validateMove(store, 'n1', 'in_progress', NO_WIP_CONFIG)
    expect(result.warnings).toHaveLength(0)
  })

  it('no WIP warning when under the limit', () => {
    const node = makeNode({ id: 'n1', status: 'ready' })
    const config: KanbanConfig = {
      ...NO_WIP_CONFIG,
      wipLimits: { ...NO_WIP_CONFIG.wipLimits, in_progress: 5 },
    }
    const store = makeStore({
      getNodeById: () => node,
      getEdgesFrom: () => [],
      getNodesByStatus: () => [makeNode({ id: 'e1', status: 'in_progress' })],
    })
    const result = validateMove(store, 'n1', 'in_progress', config)
    expect(result.warnings).toHaveLength(0)
  })

  it('WIP warning message contains the status name', () => {
    const node = makeNode({ id: 'n1', status: 'ready' })
    const config: KanbanConfig = {
      ...NO_WIP_CONFIG,
      wipLimits: { ...NO_WIP_CONFIG.wipLimits, in_progress: 1 },
    }
    const store = makeStore({
      getNodeById: () => node,
      getEdgesFrom: () => [],
      getNodesByStatus: () => [makeNode({ id: 'e1', status: 'in_progress' })],
    })
    const result = validateMove(store, 'n1', 'in_progress', config)
    expect(result.warnings[0]).toContain('in_progress')
  })
})
