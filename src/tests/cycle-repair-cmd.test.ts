/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/cycle-repair-cmd.ts — wires repairCycles
 * (node_wire_efbdbb865f99), which had zero real callers despite detectCycles
 * itself being heavily used across readiness gates. Report-only by default;
 * --apply mutates via the real store.deleteEdge for high-confidence proposals.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { cycleRepairCommand } from '../cli/commands/cycle-repair-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function run(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((chunk: unknown) => {
    out.push(String(chunk))
    return true
  }) as typeof process.stdout.write
  try {
    await cycleRepairCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return lastEnvelope(out)
}

function node(id: string): GraphNode {
  const now = new Date().toISOString()
  return { id, type: 'task', title: `Task ${id}`, status: 'backlog', priority: 3, createdAt: now, updatedAt: now }
}

describe('agf cycle-repair (node_wire_efbdbb865f99)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('report-only by default: detects a real 2-node cycle without mutating the graph', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-cycle-repair-'))
    const store = SqliteStore.open(dir)
    store.initProject('cycle-repair-test')
    store.insertNode(node('a'))
    store.insertNode(node('b'))
    store.insertEdge({ id: 'e1', from: 'a', to: 'b', relationType: 'depends_on', createdAt: new Date().toISOString() })
    store.insertEdge({ id: 'e2', from: 'b', to: 'a', relationType: 'depends_on', createdAt: new Date().toISOString() })
    store.close()

    const result = await run(['-d', dir])
    expect(result.ok).toBe(true)
    const data = result.data as { action: string; autoApplied: Array<{ confidence: string }> }
    expect(data.autoApplied).toHaveLength(1)
    expect(data.autoApplied[0].confidence).toBe('high')
    expect(data.action).toBe('auto_applied')

    const after = SqliteStore.open(dir)
    const edges = after.getAllEdges()
    after.close()
    expect(edges).toHaveLength(2) // report-only: nothing removed
  })

  it('--apply actually removes the high-confidence candidate edge via the real store', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-cycle-repair-apply-'))
    const store = SqliteStore.open(dir)
    store.initProject('cycle-repair-apply-test')
    store.insertNode(node('a'))
    store.insertNode(node('b'))
    store.insertEdge({ id: 'e1', from: 'a', to: 'b', relationType: 'depends_on', createdAt: '2026-01-01T00:00:00Z' })
    store.insertEdge({ id: 'e2', from: 'b', to: 'a', relationType: 'depends_on', createdAt: '2026-06-01T00:00:00Z' })
    store.close()

    const result = await run(['-d', dir, '--apply'])
    expect(result.ok).toBe(true)
    const data = result.data as { appliedEdgeIds: string[] }
    expect(data.appliedEdgeIds).toHaveLength(1)
    expect(data.appliedEdgeIds[0]).toBe('e2') // most-recently-created edge is removed

    const after = SqliteStore.open(dir)
    const edges = after.getAllEdges()
    after.close()
    expect(edges).toHaveLength(1)
    expect(edges[0].id).toBe('e1')
  })

  it('returns none_needed for an acyclic graph', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-cycle-repair-none-'))
    const store = SqliteStore.open(dir)
    store.initProject('cycle-repair-none-test')
    store.insertNode(node('a'))
    store.insertNode(node('b'))
    store.insertEdge({ id: 'e1', from: 'a', to: 'b', relationType: 'depends_on', createdAt: new Date().toISOString() })
    store.close()

    const result = await run(['-d', dir])
    expect((result.data as { action: string }).action).toBe('none_needed')
  })
})
