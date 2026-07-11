/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { GraphSnapshotCache, type GraphSnapshot } from '../core/store/graph-snapshot-cache.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'

function createMockStore(nodes: GraphNode[] = [], edges: GraphEdge[] = []): SqliteStore {
  return {
    getAllNodes: () => nodes,
    getAllEdges: () => edges,
  } as unknown as SqliteStore
}

function makeNode(overrides?: Partial<GraphNode>): GraphNode {
  return {
    id: 'node-1',
    type: 'task',
    title: 'Test Task',
    status: 'backlog',
    priority: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeEdge(overrides?: Partial<GraphEdge>): GraphEdge {
  return {
    id: 'edge-1',
    from: 'node-1',
    to: 'node-2',
    relationType: 'depends_on',
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('GraphSnapshotCache', () => {
  let cache: GraphSnapshotCache

  describe('getCachedSnapshot', () => {
    it('returns snapshot with nodes and edges from store', () => {
      const nodes = [makeNode({ id: 'n1' }), makeNode({ id: 'n2' })]
      const edges = [makeEdge({ id: 'e1' })]
      const store = createMockStore(nodes, edges)
      cache = new GraphSnapshotCache(store)

      const snapshot = cache.getCachedSnapshot()

      expect(snapshot.nodes).toHaveLength(2)
      expect(snapshot.edges).toHaveLength(1)
      expect(snapshot.nodes[0].id).toBe('n1')
      expect(snapshot.edges[0].id).toBe('e1')
    })

    it('returns same reference on repeated calls (cached)', () => {
      const store = createMockStore([makeNode()], [makeEdge()])
      cache = new GraphSnapshotCache(store)

      const first = cache.getCachedSnapshot()
      const second = cache.getCachedSnapshot()

      expect(first).toBe(second)
      expect(first.nodes).toBe(second.nodes)
      expect(first.edges).toBe(second.edges)
    })

    it('does not call store on cache hit', () => {
      let callCount = 0
      const store = {
        getAllNodes: () => {
          callCount++
          return [makeNode()]
        },
        getAllEdges: () => {
          callCount++
          return [makeEdge()]
        },
      } as unknown as SqliteStore
      cache = new GraphSnapshotCache(store)

      cache.getCachedSnapshot()
      cache.getCachedSnapshot()
      cache.getCachedSnapshot()

      // First call hit store (miss), subsequent hits use cache
      expect(callCount).toBe(2) // 1 getAllNodes + 1 getAllEdges
    })

    it('returns empty snapshot when store has no data', () => {
      const store = createMockStore([], [])
      cache = new GraphSnapshotCache(store)

      const snapshot = cache.getCachedSnapshot()

      expect(snapshot.nodes).toEqual([])
      expect(snapshot.edges).toEqual([])
    })

    it('handles large number of nodes/edges', () => {
      const nodes = Array.from({ length: 1000 }, (_, i) => makeNode({ id: `n-${i}`, title: `Node ${i}` }))
      const edges = Array.from({ length: 500 }, (_, i) => makeEdge({ id: `e-${i}`, from: `n-${i}`, to: `n-${i + 1}` }))
      const store = createMockStore(nodes, edges)
      cache = new GraphSnapshotCache(store)

      const snapshot = cache.getCachedSnapshot()

      expect(snapshot.nodes).toHaveLength(1000)
      expect(snapshot.edges).toHaveLength(500)
    })
  })

  describe('invalidate', () => {
    it('clears the cached snapshot', () => {
      const store = createMockStore([makeNode({ id: 'n1' })], [makeEdge()])
      cache = new GraphSnapshotCache(store)

      cache.getCachedSnapshot()
      cache.invalidate()

      const nodes = [makeNode({ id: 'n1' }), makeNode({ id: 'n2' })]
      const edges: GraphEdge[] = []
      const store2 = createMockStore(nodes, edges)
      cache = new GraphSnapshotCache(store2)

      const snapshot = cache.getCachedSnapshot()
      expect(snapshot.nodes).toHaveLength(2)
    })

    it('forces fresh read from store after invalidation', () => {
      let nodeData = [makeNode({ id: 'v1' })]
      const store = {
        getAllNodes: () => nodeData,
        getAllEdges: () => [] as GraphEdge[],
      } as unknown as SqliteStore
      cache = new GraphSnapshotCache(store)

      const first = cache.getCachedSnapshot()
      expect(first.nodes).toHaveLength(1)

      cache.invalidate()

      nodeData = [makeNode({ id: 'v1' }), makeNode({ id: 'v2' })]
      const second = cache.getCachedSnapshot()
      expect(second.nodes).toHaveLength(2)
      expect(second).not.toBe(first)
    })

    it('can be called multiple times without error', () => {
      const store = createMockStore([makeNode()], [makeEdge()])
      cache = new GraphSnapshotCache(store)

      expect(() => {
        cache.invalidate()
        cache.invalidate()
        cache.invalidate()
      }).not.toThrow()
    })
  })

  describe('getStats', () => {
    it('starts with zero hits and misses', () => {
      const store = createMockStore([makeNode()], [makeEdge()])
      cache = new GraphSnapshotCache(store)

      const stats = cache.getStats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
    })

    it('tracks hits correctly', () => {
      const store = createMockStore([makeNode()], [makeEdge()])
      cache = new GraphSnapshotCache(store)

      cache.getCachedSnapshot() // miss
      cache.getCachedSnapshot() // hit
      cache.getCachedSnapshot() // hit

      const stats = cache.getStats()
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(1)
    })

    it('tracks misses correctly after invalidation', () => {
      const store = createMockStore([makeNode()], [makeEdge()])
      cache = new GraphSnapshotCache(store)

      cache.getCachedSnapshot() // miss
      cache.invalidate()
      cache.getCachedSnapshot() // miss (cached was null)
      cache.getCachedSnapshot() // hit

      const stats = cache.getStats()
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(2)
    })

    it('returns a copy of stats (immutable)', () => {
      const store = createMockStore([makeNode()], [makeEdge()])
      cache = new GraphSnapshotCache(store)

      const stats = cache.getStats()
      stats.hits = 999

      const stats2 = cache.getStats()
      expect(stats2.hits).toBe(0)
    })
  })
})
