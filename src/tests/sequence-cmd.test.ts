/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/sequence-cmd.ts — wires the dormant
 * auto-sequence.ts (node_wire_2126a89f2ca0) as a new `agf sequence <parentId>`
 * command, so its already-tested sequenceSubtasks() function becomes
 * reachable from a real CLI surface.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { sequenceCommand } from '../cli/commands/sequence-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function runSequence(parentId: string, dir: string): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    await sequenceCommand().parseAsync([parentId, '-d', dir], { from: 'user' })
  } finally {
    spy.mockRestore()
  }
  return lastEnvelope(out)
}

describe('agf sequence (node_wire_2126a89f2ca0)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-sequence-cmd-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function addNode(store: SqliteStore, id: string, parentId: string | null, createdAt: string): void {
    store.insertNode({
      id,
      type: 'task',
      title: `Task ${id}`,
      status: 'backlog',
      priority: 2,
      parentId,
      acceptanceCriteria: [],
      tags: [],
      createdAt,
      updatedAt: createdAt,
    } as GraphNode)
  }

  it("creates a depends_on chain across a parent's children, ordered by createdAt", async () => {
    const store = SqliteStore.open(dir)
    store.initProject('sequence-cmd-test')
    addNode(store, 'epic1', null, '2026-01-01T00:00:00.000Z')
    addNode(store, 'c1', 'epic1', '2026-01-01T00:00:01.000Z')
    addNode(store, 'c2', 'epic1', '2026-01-01T00:00:02.000Z')
    addNode(store, 'c3', 'epic1', '2026-01-01T00:00:03.000Z')
    store.close()

    const envelope = await runSequence('epic1', dir)
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { edgesCreated: number; chain: string[] }
    expect(data.edgesCreated).toBe(2)
    expect(data.chain).toEqual(['c1', 'c2', 'c3'])

    const store2 = SqliteStore.open(dir)
    const edges = store2.getAllEdges().filter((e) => e.relationType === 'depends_on')
    store2.close()
    expect(edges.some((e) => e.from === 'c2' && e.to === 'c1')).toBe(true)
    expect(edges.some((e) => e.from === 'c3' && e.to === 'c2')).toBe(true)
  })

  it('returns NOT_FOUND for a non-existent parent', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('sequence-cmd-test')
    store.close()

    const envelope = await runSequence('does-not-exist', dir)
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('NOT_FOUND')
  })
})
