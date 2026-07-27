/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_1adf757784bf — C86-T1: tests for makeAlgorithmsPort (correct basename for harness)
 *
 * AC: harness violation for algorithms-port resolved; blast gate passes
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

describe('makeAlgorithmsPort (algorithms-port)', () => {
  it('returns an object (the port)', () => {
    const port = makeAlgorithmsPort(makeStore())
    expect(port).toBeTruthy()
    expect(typeof port).toBe('object')
  })

  it('topologicalSort returns a string containing node title', () => {
    const port = makeAlgorithmsPort(makeStore())
    const result = port.topologicalSort()
    expect(typeof result).toBe('string')
    expect(result).toContain('Task A')
  })

  it('bfs returns a string', () => {
    const port = makeAlgorithmsPort(makeStore())
    expect(typeof port.bfs('node_a')).toBe('string')
  })

  it('dfs returns a string', () => {
    const port = makeAlgorithmsPort(makeStore())
    expect(typeof port.dfs('node_a')).toBe('string')
  })

  it('pageRank returns a string', () => {
    const port = makeAlgorithmsPort(makeStore())
    expect(typeof port.pageRank()).toBe('string')
  })

  it('graphMetrics returns a string', () => {
    const port = makeAlgorithmsPort(makeStore())
    expect(typeof port.graphMetrics()).toBe('string')
  })

  it('entropy returns a string', () => {
    const port = makeAlgorithmsPort(makeStore())
    expect(typeof port.entropy()).toBe('string')
  })

  it('dijkstra returns a string', () => {
    const port = makeAlgorithmsPort(makeStore())
    expect(typeof port.dijkstra('node_a', 'node_b')).toBe('string')
  })

  it('suffixSearch finds a pattern position in text', () => {
    const port = makeAlgorithmsPort(makeStore())
    const result = port.suffixSearch('banana', 'ana')
    expect(typeof result).toBe('string')
    expect(result).toContain('1')
  })

  it('suffixSearch reports no match for an absent pattern', () => {
    const port = makeAlgorithmsPort(makeStore())
    const result = port.suffixSearch('banana', 'xyz')
    expect(result).toContain('No match')
  })

  it('suffixSearch returns usage when args are missing', () => {
    const port = makeAlgorithmsPort(makeStore())
    expect(port.suffixSearch('', '')).toContain('Usage')
  })
})
