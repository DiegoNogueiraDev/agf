/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_wire_b7a64b61d306 — wire the dormant epic-promotion.ts capability
 * (checkEpicPromotion, autoPromoteEpic, cascadeDownOnDone) into a CLI surface:
 * `agf node promote <id> [--auto]`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { nodeCommand } from '../cli/commands/node-cmd.js'

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

describe('agf node promote — wires epic-promotion.ts into the CLI', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-node-promote-'))
    SqliteStore.open(dir).initProject('proj')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns a null suggestion when the node has no parent', async () => {
    const added = await runNode(['add', '--title', 'Solo task', '-d', dir])
    const id = (added.data as { id: string }).id

    const envelope = await runNode(['promote', id, '-d', dir])
    expect(envelope.ok).toBe(true)
    expect((envelope.data as { suggestion: unknown }).suggestion).toBeNull()
  })

  it('returns a non-null suggestion when all siblings of the parent are done', async () => {
    const epic = await runNode(['add', '--title', 'Epic', '-d', dir])
    const epicId = (epic.data as { id: string }).id
    const child = await runNode(['add', '--title', 'Child', '--parent', epicId, '--status', 'done', '-d', dir])
    const childId = (child.data as { id: string }).id

    const envelope = await runNode(['promote', childId, '-d', dir])
    expect(envelope.ok).toBe(true)
    const suggestion = (envelope.data as { suggestion: { parentId: string } | null }).suggestion
    expect(suggestion).not.toBeNull()
    expect(suggestion?.parentId).toBe(epicId)
  })

  it('--auto flips the parent to done and reports the promoted id', async () => {
    const epic = await runNode(['add', '--title', 'Epic', '-d', dir])
    const epicId = (epic.data as { id: string }).id
    const child = await runNode(['add', '--title', 'Child', '--parent', epicId, '--status', 'done', '-d', dir])
    const childId = (child.data as { id: string }).id

    const envelope = await runNode(['promote', childId, '--auto', '-d', dir])
    expect(envelope.ok).toBe(true)
    expect((envelope.data as { promoted: string[] }).promoted).toContain(epicId)

    const shown = await runNode(['show', epicId, '-d', dir])
    expect((shown.data as { node: { status: string } }).node.status).toBe('done')
  })

  it("--auto cascades a done node's AC/subtask children to done", async () => {
    const parent = await runNode(['add', '--title', 'Parent task', '--status', 'done', '-d', dir])
    const parentId = (parent.data as { id: string }).id
    const ac = await runNode([
      'add',
      '--title',
      'AC 1',
      '--type',
      'acceptance_criteria',
      '--parent',
      parentId,
      '-d',
      dir,
    ])
    const acId = (ac.data as { id: string }).id

    const envelope = await runNode(['promote', parentId, '--auto', '-d', dir])
    expect(envelope.ok).toBe(true)
    expect((envelope.data as { cascaded: string[] }).cascaded).toContain(acId)

    const shown = await runNode(['show', acId, '-d', dir])
    expect((shown.data as { node: { status: string } }).node.status).toBe('done')
  })
})
