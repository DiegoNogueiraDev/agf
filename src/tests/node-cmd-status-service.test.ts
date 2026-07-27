/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_b468a19a7e0f — migrate `agf node status`'s raw write from
 * store.updateNodeStatus to RealTaskLifecycleService.updateStatus (the
 * single-authority service, contracts/task-lifecycle.ts). node-cmd.ts keeps
 * owning transition VALIDATION (the contract's updateStatus is deliberately
 * a raw setter — confirmed by contract-task-lifecycle.test.ts's "accepts all
 * valid status transitions without throwing"); only the write delegates.
 * Behavior must stay byte-identical: valid transitions succeed, invalid ones
 * still reject with INVALID_TRANSITION before reaching the service.
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

describe('agf node status — delegates the write to RealTaskLifecycleService', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-node-status-service-'))
    SqliteStore.open(dir).initProject('proj')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('a valid transition (backlog -> in_progress) succeeds exactly as before', async () => {
    const added = await runNode(['add', '--title', 'X', '-d', dir])
    const id = (added.data as { id: string }).id

    const envelope = await runNode(['status', id, 'in_progress', '-d', dir])
    expect(envelope.ok).toBe(true)
    expect(envelope.data).toEqual({ id, from: 'backlog', to: 'in_progress' })
  })

  it('an invalid transition (done -> backlog) still rejects with INVALID_TRANSITION before reaching the service', async () => {
    const added = await runNode(['add', '--title', 'X', '--status', 'done', '-d', dir])
    const id = (added.data as { id: string }).id

    const envelope = await runNode(['status', id, 'backlog', '-d', dir])
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('INVALID_TRANSITION')
  })

  it('the node is actually persisted via the service (re-reading the store shows the new status)', async () => {
    const added = await runNode(['add', '--title', 'X', '-d', dir])
    const id = (added.data as { id: string }).id
    await runNode(['status', id, 'in_progress', '-d', dir])

    const shown = await runNode(['show', id, '-d', dir])
    const node = (shown.data as { node: { status: string } }).node
    expect(node.status).toBe('in_progress')
  })
})
