/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/federation-cmd.ts — wires federation-config.ts's
 * peer registry + a real `tick` consumer (node_wire_45054caffa64), the
 * missing `federation-tick.ts` piece federation-config.ts's own docblock
 * referenced but that was never built.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { federationCommand } from '../cli/commands/federation-cmd.js'

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
    await federationCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return lastEnvelope(out)
}

describe('agf federation (node_wire_45054caffa64)', () => {
  let peerDir: string
  let selfDir: string

  afterEach(() => {
    if (peerDir) rmSync(peerDir, { recursive: true, force: true })
    if (selfDir) rmSync(selfDir, { recursive: true, force: true })
  })

  it('add-peer → list roundtrips a real peer through project_settings', async () => {
    selfDir = mkdtempSync(join(tmpdir(), 'agf-fed-self-'))
    const store = SqliteStore.open(selfDir)
    store.initProject('self-project')
    store.close()

    const added = await run(['add-peer', 'peer-a', '/tmp/peer-a/workflow-graph/graph.db', '-d', selfDir])
    expect(added.ok).toBe(true)
    expect((added.data as { peers: Array<{ projectName: string }> }).peers).toHaveLength(1)

    const listed = await run(['list', '-d', selfDir])
    expect((listed.data as { peers: Array<{ projectName: string; enabled: boolean }> }).peers[0]).toMatchObject({
      projectName: 'peer-a',
      enabled: true,
    })
  })

  it('tick pulls real knowledge_documents from an enabled peer via learnFromProject', async () => {
    peerDir = mkdtempSync(join(tmpdir(), 'agf-fed-peer-'))
    selfDir = mkdtempSync(join(tmpdir(), 'agf-fed-self-tick-'))

    const peer = SqliteStore.open(peerDir)
    peer.initProject('peer-project')
    const now = new Date().toISOString()
    peer
      .getDb()
      .prepare(
        `INSERT INTO knowledge_documents
           (id, source_type, source_id, title, content, content_hash, chunk_index, quality_score, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      )
      .run('doc1', 'memory', 'node_y', 'Federated title', 'Federated content', 'hash2', 0.8, now, now)
    peer.close()

    const self = SqliteStore.open(selfDir)
    self.initProject('self-project-tick')
    self.close()

    await run(['add-peer', 'peer-b', join(peerDir, 'workflow-graph', 'graph.db'), '-d', selfDir])
    const tick = await run(['tick', '-d', selfDir])
    expect(tick.ok).toBe(true)
    const data = tick.data as { peersProcessed: number; results: Array<{ projectName: string; imported: number }> }
    expect(data.peersProcessed).toBe(1)
    expect(data.results[0].imported).toBe(1)

    const after = SqliteStore.open(selfDir)
    const rows = after.getDb().prepare('SELECT * FROM knowledge_documents').all() as Array<{ title: string }>
    after.close()
    expect(rows.some((r) => r.title === 'Federated title')).toBe(true)
  })

  it('tick skips disabled peers', async () => {
    peerDir = mkdtempSync(join(tmpdir(), 'agf-fed-peer-disabled-'))
    selfDir = mkdtempSync(join(tmpdir(), 'agf-fed-self-disabled-'))
    const peer = SqliteStore.open(peerDir)
    peer.initProject('peer-disabled')
    peer.close()
    const self = SqliteStore.open(selfDir)
    self.initProject('self-disabled')
    self.close()

    await run(['add-peer', 'peer-c', join(peerDir, 'workflow-graph', 'graph.db'), '--disabled', '-d', selfDir])
    const tick = await run(['tick', '-d', selfDir])
    expect((tick.data as { peersProcessed: number }).peersProcessed).toBe(0)
  })
})
