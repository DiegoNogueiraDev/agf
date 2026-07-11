/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_fabd6ad1556b — agf node replace preserves edges on re-creation.
 * The bug: `agf node rm <id>` + `agf node add` (re-creating a node with the
 * same purpose, e.g. after ac_quality_pass fails and the AC changes) loses
 * ALL edges — each re-creation orphans edges silently since the new node
 * gets a different id. `agf node replace <id>` reads the old node's edges,
 * archives the old node, inserts a new one (same type/status/parentId/tags),
 * and rewires every edge to the new id.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { nodeCommand } from '../cli/commands/node-cmd.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

function addNode(store: SqliteStore, id: string, overrides: Partial<GraphNode> = {}): void {
  const now = new Date().toISOString()
  store.insertNode({
    id,
    type: 'task',
    title: id,
    status: 'backlog',
    priority: 2,
    acceptanceCriteria: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as GraphNode)
}

describe('agf node replace — preserves edges on re-creation', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-node-replace-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('GIVEN node_X with 3 edges (2 as from, 1 as to) THEN the new node has 3 edges rewired and the old node is archived', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('node-replace-test')
    addNode(store, 'node_X', { parentId: undefined, tags: ['a'] })
    addNode(store, 'node_A')
    addNode(store, 'node_B')
    addNode(store, 'node_C')
    store.insertEdge({
      id: 'edge_1',
      from: 'node_X',
      to: 'node_A',
      relationType: 'depends_on',
      createdAt: new Date().toISOString(),
    })
    store.insertEdge({
      id: 'edge_2',
      from: 'node_X',
      to: 'node_B',
      relationType: 'blocks',
      createdAt: new Date().toISOString(),
    })
    store.insertEdge({
      id: 'edge_3',
      from: 'node_C',
      to: 'node_X',
      relationType: 'related_to',
      createdAt: new Date().toISOString(),
    })
    store.close()

    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await nodeCommand().parseAsync(['replace', 'node_X', '--title', 'New Title', '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = lastEnvelope(out)
    expect(envelope.ok).toBe(true)
    const newId = (envelope.data as Record<string, unknown>).newId as string
    expect(newId).toBeTruthy()
    expect(newId).not.toBe('node_X')

    const store2 = SqliteStore.open(dir)
    const oldNode = store2.getNodeById('node_X')
    const newNode = store2.getNodeById(newId)
    const edges = store2.getAllEdges()
    store2.close()

    expect(oldNode).toBeNull() // archived nodes are filtered out by getNodeById's soft-delete predicate
    expect(newNode).toBeDefined()
    expect(newNode?.title).toBe('New Title')

    const rewired = edges.filter((e: GraphEdge) => e.from === newId || e.to === newId)
    expect(rewired).toHaveLength(3)
    expect(edges.some((e: GraphEdge) => e.from === 'node_X' || e.to === 'node_X')).toBe(false)
  })

  it('GIVEN node_X with 0 edges THEN the new node has 0 edges and the old node is archived', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('node-replace-test')
    addNode(store, 'node_X')
    store.close()

    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await nodeCommand().parseAsync(['replace', 'node_X', '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = lastEnvelope(out)
    expect(envelope.ok).toBe(true)
    const newId = (envelope.data as Record<string, unknown>).newId as string

    const store2 = SqliteStore.open(dir)
    const edges = store2.getAllEdges().filter((e: GraphEdge) => e.from === newId || e.to === newId)
    store2.close()
    expect(edges).toHaveLength(0)
  })

  it("GIVEN node_X does not exist THEN out.err('NOT_FOUND') is returned", async () => {
    const store = SqliteStore.open(dir)
    store.initProject('node-replace-test')
    store.close()

    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await nodeCommand().parseAsync(['replace', 'node_missing', '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = lastEnvelope(out)
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('NOT_FOUND')
  })

  it('GIVEN node_X with edges and AC THEN --ac produces the new AC AND the old edges are preserved (rewired)', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('node-replace-test')
    addNode(store, 'node_X')
    addNode(store, 'node_A')
    store.insertEdge({
      id: 'edge_1',
      from: 'node_X',
      to: 'node_A',
      relationType: 'depends_on',
      createdAt: new Date().toISOString(),
    })
    store.close()

    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await nodeCommand().parseAsync(['replace', 'node_X', '--ac', 'New AC', '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = lastEnvelope(out)
    const newId = (envelope.data as Record<string, unknown>).newId as string

    const store2 = SqliteStore.open(dir)
    const newNode = store2.getNodeById(newId)
    const edges = store2.getAllEdges().filter((e: GraphEdge) => e.from === newId || e.to === newId)
    store2.close()

    expect(newNode?.acceptanceCriteria).toEqual(['New AC'])
    expect(edges).toHaveLength(1)
  })
})
