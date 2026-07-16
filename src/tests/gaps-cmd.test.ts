import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gapsCommand } from '../cli/commands/gaps-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

describe('gapsCommand', () => {
  it('returns a Command instance', () => {
    const cmd = gapsCommand()
    expect(cmd).toBeDefined()
  })

  it('has the correct command name', () => {
    const cmd = gapsCommand()
    expect(cmd.name()).toBe('gaps')
  })

  it('has a non-empty description', () => {
    const cmd = gapsCommand()
    expect(cmd.description().length).toBeGreaterThan(0)
  })
})

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

describe('agf gaps — impact ordering (node_wire_6febf082a953)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-gaps-ordering-'))
    writeFileSync(join(dir, '.gitignore'), 'workflow-graph/\n')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function addDoneNode(store: SqliteStore, id: string): void {
    const now = new Date().toISOString()
    store.insertNode({
      id,
      type: 'task',
      title: `Task ${id}`,
      status: 'done',
      priority: 2,
      acceptanceCriteria: [],
      testFiles: [`src/tests/${id}-missing.test.ts`],
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
  }

  function addBlockedNode(store: SqliteStore, id: string): void {
    const now = new Date().toISOString()
    store.insertNode({
      id,
      type: 'task',
      title: `Blocked ${id}`,
      status: 'backlog',
      priority: 2,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
  }

  function addDependsOnEdge(store: SqliteStore, from: string, to: string): void {
    store.insertEdge({
      id: `edge-${from}-${to}`,
      from,
      to,
      relationType: 'depends_on',
      createdAt: new Date().toISOString(),
    } as GraphEdge)
  }

  it('sorts phantom_done gaps by edgeUnblockingCount descending', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('gaps-ordering-test')
    // d1: phantom_done, blocks 0 downstream tasks.
    addDoneNode(store, 'd1')
    // d2: phantom_done, blocks 2 downstream (backlog) tasks via depends_on.
    addDoneNode(store, 'd2')
    addBlockedNode(store, 'w1')
    addBlockedNode(store, 'w2')
    addDependsOnEdge(store, 'd2', 'w1')
    addDependsOnEdge(store, 'd2', 'w2')
    store.close()

    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    try {
      await gapsCommand().parseAsync(['-d', dir, '--kind', 'phantom_done'], { from: 'user' })
    } finally {
      spy.mockRestore()
    }

    const envelope = lastEnvelope(out)
    const data = (envelope.data ?? envelope) as { gaps: Array<{ nodeId: string }> }
    const order = data.gaps.map((g) => g.nodeId)
    expect(order.indexOf('d2')).toBeLessThan(order.indexOf('d1'))
  })
})
