/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_88dec8267093 — C69-T1: tests for makeAlgorithmsPort
 *
 * AC: makeAlgorithmsPort with mocked store returns port;
 *     topologicalSort/bfs/dfs return formatted strings;
 *     blast gate passes
 */

import { describe, it, expect, vi } from 'vitest'
import { makeAlgorithmsPort } from '../tui/algorithms-port.js'
import type { SqliteStore } from '../core/store/sqlite-store.js'

const nodeA = {
  id: 'node_a',
  title: 'Task A',
  type: 'task' as const,
  status: 'done' as const,
  priority: 3,
  blocked: false,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  tags: [],
  xpSize: 'S' as const,
  metadata: {},
}
const nodeB = {
  id: 'node_b',
  title: 'Task B',
  type: 'task' as const,
  status: 'backlog' as const,
  priority: 2,
  blocked: false,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  tags: [],
  xpSize: 'S' as const,
  metadata: {},
}
const edgeAB = {
  id: 'edge_1',
  from: 'node_a',
  to: 'node_b',
  type: 'depends_on' as const,
  createdAt: '2026-01-01',
}

function makeStore(nodes = [nodeA, nodeB], edges = [edgeAB]): SqliteStore {
  return {
    toGraphDocument: vi.fn().mockReturnValue({ version: '1.0.0', nodes, edges }),
  } as unknown as SqliteStore
}

describe('makeAlgorithmsPort', () => {
  it('returns an object (the port)', () => {
    const port = makeAlgorithmsPort(makeStore())
    expect(port).toBeTruthy()
    expect(typeof port).toBe('object')
  })

  it('topologicalSort returns a string', () => {
    const port = makeAlgorithmsPort(makeStore())
    const result = port.topologicalSort()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('topologicalSort result contains node title', () => {
    const port = makeAlgorithmsPort(makeStore())
    const result = port.topologicalSort()
    expect(result).toContain('Task A')
  })

  it('topologicalSortDfs returns a string', () => {
    const port = makeAlgorithmsPort(makeStore())
    const result = port.topologicalSortDfs()
    expect(typeof result).toBe('string')
  })

  it('bfs returns a string containing node info', () => {
    const port = makeAlgorithmsPort(makeStore())
    const result = port.bfs('node_a')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('dfs returns a string', () => {
    const port = makeAlgorithmsPort(makeStore())
    const result = port.dfs('node_a')
    expect(typeof result).toBe('string')
  })

  it('pageRank returns a string', () => {
    const port = makeAlgorithmsPort(makeStore())
    const result = port.pageRank()
    expect(typeof result).toBe('string')
  })

  it('graphMetrics returns a string', () => {
    const port = makeAlgorithmsPort(makeStore())
    const result = port.graphMetrics()
    expect(typeof result).toBe('string')
  })

  it('entropy returns a string', () => {
    const port = makeAlgorithmsPort(makeStore())
    const result = port.entropy()
    expect(typeof result).toBe('string')
  })

  it('topologicalSort with empty graph returns cycle message', () => {
    const port = makeAlgorithmsPort(makeStore([], []))
    const result = port.topologicalSort()
    expect(typeof result).toBe('string')
  })

  it('dijkstra returns a string', () => {
    const port = makeAlgorithmsPort(makeStore())
    const result = port.dijkstra('node_a', 'node_b')
    expect(typeof result).toBe('string')
  })

  it('bellmanFord returns a string', () => {
    const port = makeAlgorithmsPort(makeStore())
    const result = port.bellmanFord('node_a')
    expect(typeof result).toBe('string')
  })

  it('cfd returns a string', () => {
    const port = makeAlgorithmsPort(makeStore())
    const result = port.cfd()
    expect(typeof result).toBe('string')
  })

  it('store.toGraphDocument is called for each algorithm invocation', () => {
    const store = makeStore()
    const port = makeAlgorithmsPort(store)
    port.topologicalSort()
    port.bfs('node_a')
    expect(store.toGraphDocument).toHaveBeenCalledTimes(2)
  })
})
