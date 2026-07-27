/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_6cbaba44e537 — reject self-referencing edge on `agf edge add`.
 * The bug: copy-paste `edge add X X` happened 3x in this session with no
 * insert-time barrier — edge-consistency-checker.ts only detects self_loop
 * a posteriori (after insertion). This adds an insert-time guard mirroring
 * that same check, with a --force-self-edge escape hatch for legit Petri
 * net self-loops.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { edgeCommand } from '../cli/commands/edge-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('agf edge add — self-loop guard', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-edge-self-loop-'))
    const store = SqliteStore.open(dir)
    store.initProject('edge-self-loop-test')
    const now = new Date().toISOString()
    for (const id of ['node_X', 'node_Y']) {
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
      } as GraphNode)
    }
    store.close()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it("GIVEN edge add node_X node_X THEN out.err('SELF_EDGE') and no edge is inserted", async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await edgeCommand().parseAsync(['add', 'node_X', 'node_X', '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = lastEnvelope(out)
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('SELF_EDGE')

    const store = SqliteStore.open(dir)
    const doc = store.toGraphDocument()
    store.close()
    expect(doc.edges).toHaveLength(0)
  })

  it('GIVEN edge add node_X node_X --force-self-edge THEN the edge is inserted with from===to', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await edgeCommand().parseAsync(['add', 'node_X', 'node_X', '--force-self-edge', '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = lastEnvelope(out)
    expect(envelope.ok).toBe(true)

    const store = SqliteStore.open(dir)
    const doc = store.toGraphDocument()
    store.close()
    expect(doc.edges).toHaveLength(1)
    expect(doc.edges[0].from).toBe('node_X')
    expect(doc.edges[0].to).toBe('node_X')
  })

  it('GIVEN edge add node_X node_Y THEN the edge is inserted normally (no regression)', async () => {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    await edgeCommand().parseAsync(['add', 'node_X', 'node_Y', '-d', dir], { from: 'user' })
    spy.mockRestore()

    const envelope = lastEnvelope(out)
    expect(envelope.ok).toBe(true)

    const store = SqliteStore.open(dir)
    const doc = store.toGraphDocument()
    store.close()
    expect(doc.edges).toHaveLength(1)
    expect(doc.edges[0].from).toBe('node_X')
    expect(doc.edges[0].to).toBe('node_Y')
  })
})
