/*!
 * Tests for graph/auto-sequence.ts
 *
 * sequenceSubtasks(store, parentId) — creates depends_on edges between
 * children of parentId, ordered by createdAt (oldest first).
 *
 * Contract:
 *   - 0 children  → {edgesCreated:0, chain:[]}
 *   - 1 child     → {edgesCreated:0, chain:[id]}
 *   - N children  → N-1 edges; child[i] depends_on child[i-1]
 *   - chain order respects createdAt (ascending)
 *   - mergeInsert is called with the edges when N >= 2
 *
 * SqliteStore stub provides toGraphDocument() and mergeInsert().
 */

import { describe, it, expect, vi } from 'vitest'
import { sequenceSubtasks } from '../core/graph/auto-sequence.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'
import type { GraphDocument } from '../core/graph/graph-types.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(id: string, parentId: string | null, createdAt: string): GraphNode {
  return {
    id,
    title: id,
    type: 'subtask',
    status: 'backlog',
    priority: 3,
    parentId,
    createdAt,
    updatedAt: createdAt,
    description: null,
  } as unknown as GraphNode
}

function makeDoc(nodes: GraphNode[]): GraphDocument {
  return {
    version: '1',
    project: { id: 'p1', name: 'test', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    nodes,
    edges: [],
    indexes: { byId: {}, childrenByParent: {}, incomingByNode: {}, outgoingByNode: {} },
    meta: { sourceFiles: [], lastImport: null },
  } as unknown as GraphDocument
}

function makeStore(nodes: GraphNode[]): { store: SqliteStore; mergeInsertFn: ReturnType<typeof vi.fn> } {
  const mergeInsertFn = vi.fn()
  const store = {
    toGraphDocument: vi.fn().mockReturnValue(makeDoc(nodes)),
    mergeInsert: mergeInsertFn,
  } as unknown as SqliteStore
  return { store, mergeInsertFn }
}

// ── 0 children ────────────────────────────────────────────────────────────────

describe('sequenceSubtasks — 0 children', () => {
  it('returns edgesCreated=0', () => {
    const { store } = makeStore([])
    const result = sequenceSubtasks(store, 'p1')
    expect(result.edgesCreated).toBe(0)
  })

  it('returns empty chain', () => {
    const { store } = makeStore([])
    const result = sequenceSubtasks(store, 'p1')
    expect(result.chain).toHaveLength(0)
  })

  it('does not call mergeInsert', () => {
    const { store, mergeInsertFn } = makeStore([])
    sequenceSubtasks(store, 'p1')
    expect(mergeInsertFn).not.toHaveBeenCalled()
  })
})

// ── 1 child ───────────────────────────────────────────────────────────────────

describe('sequenceSubtasks — 1 child', () => {
  it('returns edgesCreated=0', () => {
    const nodes = [makeNode('c1', 'p1', '2026-01-01T00:00:00.000Z')]
    const { store } = makeStore(nodes)
    const result = sequenceSubtasks(store, 'p1')
    expect(result.edgesCreated).toBe(0)
  })

  it('chain contains the single child id', () => {
    const nodes = [makeNode('c1', 'p1', '2026-01-01T00:00:00.000Z')]
    const { store } = makeStore(nodes)
    const result = sequenceSubtasks(store, 'p1')
    expect(result.chain).toEqual(['c1'])
  })

  it('does not call mergeInsert', () => {
    const nodes = [makeNode('c1', 'p1', '2026-01-01T00:00:00.000Z')]
    const { store, mergeInsertFn } = makeStore(nodes)
    sequenceSubtasks(store, 'p1')
    expect(mergeInsertFn).not.toHaveBeenCalled()
  })
})

// ── 2 children ────────────────────────────────────────────────────────────────

describe('sequenceSubtasks — 2 children', () => {
  it('returns edgesCreated=1', () => {
    const nodes = [makeNode('c1', 'p1', '2026-01-01T00:00:00.000Z'), makeNode('c2', 'p1', '2026-01-02T00:00:00.000Z')]
    const { store } = makeStore(nodes)
    const result = sequenceSubtasks(store, 'p1')
    expect(result.edgesCreated).toBe(1)
  })

  it('calls mergeInsert once', () => {
    const nodes = [makeNode('c1', 'p1', '2026-01-01T00:00:00.000Z'), makeNode('c2', 'p1', '2026-01-02T00:00:00.000Z')]
    const { store, mergeInsertFn } = makeStore(nodes)
    sequenceSubtasks(store, 'p1')
    expect(mergeInsertFn).toHaveBeenCalledTimes(1)
  })

  it('chain has both children in createdAt order', () => {
    const nodes = [makeNode('c2', 'p1', '2026-01-02T00:00:00.000Z'), makeNode('c1', 'p1', '2026-01-01T00:00:00.000Z')]
    const { store } = makeStore(nodes)
    const result = sequenceSubtasks(store, 'p1')
    expect(result.chain[0]).toBe('c1')
    expect(result.chain[1]).toBe('c2')
  })

  it('edge goes from newer child to older child (c2 depends_on c1)', () => {
    const nodes = [makeNode('c1', 'p1', '2026-01-01T00:00:00.000Z'), makeNode('c2', 'p1', '2026-01-02T00:00:00.000Z')]
    const { store, mergeInsertFn } = makeStore(nodes)
    sequenceSubtasks(store, 'p1')
    const [, edges] = mergeInsertFn.mock.calls[0] as [unknown[], unknown[]]
    const edge = (edges as Array<{ from: string; to: string; relationType: string }>)[0]
    expect(edge.from).toBe('c2')
    expect(edge.to).toBe('c1')
    expect(edge.relationType).toBe('depends_on')
  })
})

// ── 3+ children ───────────────────────────────────────────────────────────────

describe('sequenceSubtasks — 3 children', () => {
  it('returns edgesCreated=2', () => {
    const nodes = [
      makeNode('c1', 'p1', '2026-01-01T00:00:00.000Z'),
      makeNode('c2', 'p1', '2026-01-02T00:00:00.000Z'),
      makeNode('c3', 'p1', '2026-01-03T00:00:00.000Z'),
    ]
    const { store } = makeStore(nodes)
    const result = sequenceSubtasks(store, 'p1')
    expect(result.edgesCreated).toBe(2)
  })

  it('chain has 3 entries in order', () => {
    const nodes = [
      makeNode('c3', 'p1', '2026-01-03T00:00:00.000Z'),
      makeNode('c1', 'p1', '2026-01-01T00:00:00.000Z'),
      makeNode('c2', 'p1', '2026-01-02T00:00:00.000Z'),
    ]
    const { store } = makeStore(nodes)
    const result = sequenceSubtasks(store, 'p1')
    expect(result.chain).toEqual(['c1', 'c2', 'c3'])
  })

  it('only sequences children of the given parentId', () => {
    const nodes = [
      makeNode('c1', 'p1', '2026-01-01T00:00:00.000Z'),
      makeNode('c2', 'p1', '2026-01-02T00:00:00.000Z'),
      makeNode('other', 'p2', '2026-01-01T00:00:00.000Z'),
    ]
    const { store } = makeStore(nodes)
    const result = sequenceSubtasks(store, 'p1')
    expect(result.chain).toHaveLength(2)
    expect(result.edgesCreated).toBe(1)
  })
})
