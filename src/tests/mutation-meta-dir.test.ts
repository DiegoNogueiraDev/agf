/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_bda3a53ee317 — agf node add/edit/rm silently writes to the wrong
 * graph when --dir resolves unexpectedly (e.g. a shell `cd` chained without
 * a subshell). Mutating commands now include meta.dir (the resolved
 * absolute --dir) in the output envelope, so a write to the wrong project
 * is visibly detectable even though it is never blocked.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { nodeCommand } from '../cli/commands/node-cmd.js'
import { edgeCommand } from '../cli/commands/edge-cmd.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function runNode(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    await nodeCommand().parseAsync(args, { from: 'user' })
  } finally {
    spy.mockRestore()
  }
  return lastEnvelope(out)
}

async function runEdge(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    await edgeCommand().parseAsync(args, { from: 'user' })
  } finally {
    spy.mockRestore()
  }
  return lastEnvelope(out)
}

describe('mutating commands include meta.dir (the resolved --dir)', () => {
  let dirA: string
  let dirB: string

  beforeEach(() => {
    dirA = mkdtempSync(join(tmpdir(), 'agf-meta-dir-a-'))
    dirB = mkdtempSync(join(tmpdir(), 'agf-meta-dir-b-'))
    SqliteStore.open(dirA).initProject('proj-a')
    SqliteStore.open(dirB).initProject('proj-b')
  })

  afterEach(() => {
    rmSync(dirA, { recursive: true, force: true })
    rmSync(dirB, { recursive: true, force: true })
  })

  it('node add: meta.dir matches the resolved --dir, and differs between two projects', async () => {
    const envelopeA = await runNode(['add', '--title', 'X', '-d', dirA])
    const envelopeB = await runNode(['add', '--title', 'X', '-d', dirB])

    const metaA = envelopeA.meta as { dir: string }
    const metaB = envelopeB.meta as { dir: string }
    expect(metaA.dir).toBe(resolve(dirA))
    expect(metaB.dir).toBe(resolve(dirB))
    expect(metaA.dir).not.toBe(metaB.dir)
  })

  it('node status: meta.dir reflects the resolved --dir', async () => {
    const added = await runNode(['add', '--title', 'X', '-d', dirA])
    const id = (added.data as { id: string }).id

    const envelope = await runNode(['status', id, 'in_progress', '-d', dirA])
    const meta = envelope.meta as { dir: string }
    expect(meta.dir).toBe(resolve(dirA))
  })

  it('node rm: meta.dir reflects the resolved --dir', async () => {
    const added = await runNode(['add', '--title', 'X', '-d', dirA])
    const id = (added.data as { id: string }).id

    const envelope = await runNode(['rm', id, '-d', dirA])
    const meta = envelope.meta as { dir: string }
    expect(meta.dir).toBe(resolve(dirA))
  })

  it('edge add: meta.dir reflects the resolved --dir', async () => {
    const a = await runNode(['add', '--title', 'A', '-d', dirA])
    const b = await runNode(['add', '--title', 'B', '-d', dirA])
    const idA = (a.data as { id: string }).id
    const idB = (b.data as { id: string }).id

    const envelope = await runEdge(['add', idA, idB, '--type', 'related_to', '-d', dirA])
    const meta = envelope.meta as { dir: string }
    expect(meta.dir).toBe(resolve(dirA))
  })

  it('edge rm: meta.dir reflects the resolved --dir', async () => {
    const a = await runNode(['add', '--title', 'A', '-d', dirA])
    const b = await runNode(['add', '--title', 'B', '-d', dirA])
    const idA = (a.data as { id: string }).id
    const idB = (b.data as { id: string }).id
    const edgeEnvelope = await runEdge(['add', idA, idB, '--type', 'related_to', '-d', dirA])
    const edgeId = (edgeEnvelope.data as { id: string }).id

    const envelope = await runEdge(['rm', edgeId, '-d', dirA])
    const meta = envelope.meta as { dir: string }
    expect(meta.dir).toBe(resolve(dirA))
  })
})
