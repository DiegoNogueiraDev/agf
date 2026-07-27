/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (c) 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/reclassify-structural-cmd.ts — wires
 * reclassifyStructural (node_wire_638ad3e7f2b3), which had zero real callers
 * despite complementing agf insights auto-ready's implementable metadata flag.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { reclassifyStructuralCommand } from '../cli/commands/reclassify-structural-cmd.js'
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
    await reclassifyStructuralCommand().parseAsync(args, { from: 'user' })
  } finally {
    process.stdout.write = spy
  }
  return lastEnvelope(out)
}

function node(id: string, title: string): GraphNode {
  const now = new Date().toISOString()
  return { id, type: 'task', title, status: 'backlog', priority: 3, createdAt: now, updatedAt: now }
}

describe('agf reclassify-structural (node_wire_638ad3e7f2b3)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('report-only by default: finds a real structural-heading node without mutating it', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-reclassify-'))
    const store = SqliteStore.open(dir)
    store.initProject('reclassify-test')
    store.insertNode(node('t1', 'TIER A — Core Infra'))
    store.insertNode(node('t2', 'Regular implementation task'))
    store.close()

    const result = await run(['-d', dir])
    expect(result.ok).toBe(true)
    const data = result.data as { totalCandidates: number; applied: number; candidates: Array<{ nodeId: string }> }
    expect(data.totalCandidates).toBe(1)
    expect(data.candidates[0].nodeId).toBe('t1')
    expect(data.applied).toBe(0)

    const after = SqliteStore.open(dir)
    const t1 = after.getNodeById('t1')
    after.close()
    expect(t1?.metadata?.implementable).toBeUndefined()
  })

  it('--apply actually sets metadata.implementable=false via the real store', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-reclassify-apply-'))
    const store = SqliteStore.open(dir)
    store.initProject('reclassify-apply-test')
    store.insertNode(node('t1', 'Sequenciamento (4 sprints)'))
    store.close()

    const result = await run(['-d', dir, '--apply'])
    expect(result.ok).toBe(true)
    expect((result.data as { applied: number }).applied).toBe(1)

    const after = SqliteStore.open(dir)
    const t1 = after.getNodeById('t1')
    after.close()
    expect(t1?.metadata?.implementable).toBe(false)
  })

  it('returns zero candidates for a graph with no structural headings', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-reclassify-none-'))
    const store = SqliteStore.open(dir)
    store.initProject('reclassify-none-test')
    store.insertNode(node('t1', 'Fix the login bug'))
    store.close()

    const result = await run(['-d', dir])
    expect((result.data as { totalCandidates: number }).totalCandidates).toBe(0)
  })
})
