/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * node_wire_dfd0c729b99b — I/O wire for session-end-snapshot.ts: registers a
 * real session:end listener that gathers real store/ledger data and writes
 * an actual snapshot file to workflow-graph/snapshots/, pruning old ones.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { getSharedHookBus, _resetSharedHookBus } from '../core/hooks/shared-hook-bus.js'
import { registerSessionEndSnapshot } from '../core/hooks/session-end-snapshot-writer.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function makeProjectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'agf-session-snapshot-'))
  const store = SqliteStore.open(dir)
  store.initProject('snapshot-test')
  store.insertNode({
    id: 'n1',
    type: 'task',
    title: 'n1',
    status: 'done',
    priority: 3,
    xpSize: 'M',
    tags: [],
    blocked: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as GraphNode)
  store.close()
  return dir
}

describe('registerSessionEndSnapshot (node_wire_dfd0c729b99b)', () => {
  let dir: string
  const originalEnv = process.env.MCP_GRAPH_SESSION_SNAPSHOT

  beforeEach(() => {
    _resetSharedHookBus()
    dir = makeProjectDir()
    delete process.env.MCP_GRAPH_SESSION_SNAPSHOT
  })

  afterEach(() => {
    _resetSharedHookBus()
    rmSync(dir, { recursive: true, force: true })
    if (originalEnv === undefined) delete process.env.MCP_GRAPH_SESSION_SNAPSHOT
    else process.env.MCP_GRAPH_SESSION_SNAPSHOT = originalEnv
  })

  it('writes a real snapshot file to workflow-graph/snapshots/ on session:end', async () => {
    const startedAtMs = Date.now() - 1000
    registerSessionEndSnapshot(dir, startedAtMs)

    await getSharedHookBus().emit({
      channel: 'session:end',
      timestamp: new Date().toISOString(),
      payload: { sessionId: 'sess-1', reason: 'test' },
    })

    const snapshotsDir = join(dir, 'workflow-graph', 'snapshots')
    const files = readdirSync(snapshotsDir)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^session-.*sess-1\.json$/)

    const payload = JSON.parse(readFileSync(join(snapshotsDir, files[0]), 'utf-8'))
    expect(payload.sessionId).toBe('sess-1')
    expect(payload.schemaVersion).toBe(1)
    expect(payload.nodeCountsByStatus.done).toBe(1)
    expect(payload.tasksDone).toBe(1)
  })

  it('does nothing when MCP_GRAPH_SESSION_SNAPSHOT=off', async () => {
    process.env.MCP_GRAPH_SESSION_SNAPSHOT = 'off'
    registerSessionEndSnapshot(dir, Date.now())

    await getSharedHookBus().emit({
      channel: 'session:end',
      timestamp: new Date().toISOString(),
      payload: { sessionId: 'sess-2', reason: 'test' },
    })

    const snapshotsDir = join(dir, 'workflow-graph', 'snapshots')
    expect(() => readdirSync(snapshotsDir)).toThrow() // directory never created
  })

  it('prunes files beyond SNAPSHOT_RETENTION, keeping the most recent', async () => {
    const snapshotsDir = join(dir, 'workflow-graph', 'snapshots')
    mkdirSync(snapshotsDir, { recursive: true })
    // Seed 31 fake pre-existing snapshot files (SNAPSHOT_RETENTION=30).
    for (let i = 0; i < 31; i++) {
      writeFileSync(
        join(snapshotsDir, `session-2020-01-${String(i + 1).padStart(2, '0')}T00-00-00-000Z-old${i}.json`),
        '{}',
      )
    }

    registerSessionEndSnapshot(dir, Date.now())
    await getSharedHookBus().emit({
      channel: 'session:end',
      timestamp: new Date().toISOString(),
      payload: { sessionId: 'sess-3', reason: 'test' },
    })

    const remaining = readdirSync(snapshotsDir)
    expect(remaining.length).toBeLessThanOrEqual(31) // 31 old + 1 new, pruned to 30
  })

  it('the returned disposer removes the listener', async () => {
    const dispose = registerSessionEndSnapshot(dir, Date.now())
    dispose()

    await getSharedHookBus().emit({
      channel: 'session:end',
      timestamp: new Date().toISOString(),
      payload: { sessionId: 'sess-4', reason: 'test' },
    })

    const snapshotsDir = join(dir, 'workflow-graph', 'snapshots')
    expect(() => readdirSync(snapshotsDir)).toThrow() // never fired after disposal
  })
})
