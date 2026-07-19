/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_5e44fdf17849 — the colony pulls the independentSet into parallel claims,
 * relaxing WIP=1 ONLY across the dependency-independent set, while resource_locks
 * (exactly-one-winner) + the declared-file boundary keep two ants off the same
 * file/state. Reuses independentSet + LockManager + declaredFilesOf — no new
 * coordination. Tested against a REAL in-memory store (no mocks).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { LockManager } from '../core/store/lock-manager.js'
import { taskResourceId } from '../core/planner/task-resource-key.js'
import { pullIndependentBatch } from '../core/swarm/colony-batch.js'
import { swarmCommand } from '../cli/commands/swarm-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

let store: SqliteStore

afterEach(() => store?.close())

function seed(nodes: Array<Partial<GraphNode> & { id: string }>, edges: Array<[string, string]> = []): SqliteStore {
  store = SqliteStore.open(':memory:')
  store.initProject('colony-parallel')
  const now = new Date().toISOString()
  for (const n of nodes) {
    store.insertNode({
      type: 'task',
      title: n.id,
      status: 'backlog',
      priority: 3,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
      ...n,
    } as GraphNode)
  }
  for (const [from, to] of edges) {
    store.insertEdge({ id: `${from}-${to}`, from, to, relationType: 'depends_on', createdAt: now })
  }
  return store
}

describe('pullIndependentBatch — colony parallel pull with WIP relaxed on the independent set', () => {
  it('AC1: two independent tasks are both claimed in parallel (distinct leases)', () => {
    const s = seed([{ id: 'a' }, { id: 'b' }])
    const locks = new LockManager(s.getDb())
    const batch = pullIndependentBatch(s.toGraphDocument(), locks, 2)
    expect(batch).toHaveLength(2)
    // distinct agents + real leases held in resource_locks
    expect(new Set(batch.map((c) => c.agentId)).size).toBe(2)
    for (const c of batch) {
      const row = s
        .getDb()
        .prepare('SELECT agent_id FROM resource_locks WHERE resource_id = ?')
        .get(taskResourceId(c.node.id))
      expect(row).toBeTruthy()
    }
  })

  it('AC2: dependent tasks stay serial (WIP=1) — only the independent one is pulled', () => {
    // a depends_on b — they are on one chain
    const s = seed([{ id: 'a' }, { id: 'b' }], [['a', 'b']])
    const locks = new LockManager(s.getDb())
    const batch = pullIndependentBatch(s.toGraphDocument(), locks, 3)
    expect(batch).toHaveLength(1)
  })

  it('AC3: two ants that would write the same file — the second is serialized out (no concurrent write)', () => {
    const s = seed([
      { id: 'a', implementationFiles: ['src/shared.ts'] },
      { id: 'b', implementationFiles: ['src/shared.ts'] },
    ])
    const locks = new LockManager(s.getDb())
    const batch = pullIndependentBatch(s.toGraphDocument(), locks, 2)
    expect(batch).toHaveLength(1) // second rejected by declared-file collision
  })

  it('skips a task already leased by another ant (resource_locks exactly-one-winner)', () => {
    const s = seed([{ id: 'a' }, { id: 'b' }])
    const locks = new LockManager(s.getDb())
    // another ant already holds task:a
    locks.acquire(taskResourceId('a'), 'other-ant')
    const batch = pullIndependentBatch(s.toGraphDocument(), locks, 2)
    expect(batch.map((c) => c.node.id)).toEqual(['b'])
  })

  it('returns [] for k <= 0 without touching the lock table', () => {
    const s = seed([{ id: 'a' }])
    const locks = new LockManager(s.getDb())
    expect(pullIndependentBatch(s.toGraphDocument(), locks, 0)).toHaveLength(0)
    const count = s.getDb().prepare('SELECT COUNT(*) AS c FROM resource_locks').get() as { c: number }
    expect(count.c).toBe(0)
  })
})

describe('agf swarm batch — the CLI surface reaches pullIndependentBatch (not dormant)', () => {
  let dir: string
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('emits the parallel batch of independent claims in the envelope', async () => {
    dir = mkdtempSync(join(tmpdir(), 'colony-cmd-'))
    const s = SqliteStore.open(dir)
    s.initProject('colony-cmd')
    const now = new Date().toISOString()
    for (const id of ['a', 'b']) {
      s.insertNode({
        id,
        type: 'task',
        title: id,
        status: 'backlog',
        priority: 3,
        acceptanceCriteria: [],
        tags: [],
        createdAt: now,
        updatedAt: now,
      } as GraphNode)
    }
    s.close()

    const out: string[] = []
    const spy = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await swarmCommand().parseAsync(['batch', '-d', dir, '-k', '2'], { from: 'user' })
    } finally {
      process.stdout.write = spy
    }
    const env = JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
    expect(env.ok).toBe(true)
    expect(env.data.size).toBe(2)
    expect(env.data.claims.map((c: { nodeId: string }) => c.nodeId).sort()).toEqual(['a', 'b'])
  })
})
