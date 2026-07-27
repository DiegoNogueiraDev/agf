/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/role-cmd.ts — wires the dormant agent-role.ts
 * (node_wire_5593ef278524) as a new `agf role set|get` command, so
 * registerAgentRole/getAgentRole become reachable from a real CLI surface.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { roleCommand } from '../cli/commands/role-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function runRole(args: string[], dir: string): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    await roleCommand().parseAsync([...args, '-d', dir], { from: 'user' })
  } finally {
    spy.mockRestore()
  }
  return lastEnvelope(out)
}

describe('agf role (node_wire_5593ef278524)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-role-cmd-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function addNode(store: SqliteStore, id: string): void {
    const now = new Date().toISOString()
    store.insertNode({
      id,
      type: 'task',
      title: `Task ${id}`,
      status: 'in_progress',
      priority: 2,
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
  }

  it('registers a role then reads it back', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('role-cmd-test')
    addNode(store, 'task1')
    store.close()

    const setEnvelope = await runRole(['set', 'task1', 'reviewer'], dir)
    expect(setEnvelope.ok).toBe(true)

    const getEnvelope = await runRole(['get', 'task1'], dir)
    expect(getEnvelope.ok).toBe(true)
    const data = getEnvelope.data as { role: string | null }
    expect(data.role).toBe('reviewer')
  })

  it('returns role=null when nothing was registered', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('role-cmd-test')
    addNode(store, 'task2')
    store.close()

    const getEnvelope = await runRole(['get', 'task2'], dir)
    expect(getEnvelope.ok).toBe(true)
    const data = getEnvelope.data as { role: string | null }
    expect(data.role).toBeNull()
  })

  it('rejects an invalid role', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('role-cmd-test')
    addNode(store, 'task3')
    store.close()

    const envelope = await runRole(['set', 'task3', 'not-a-role'], dir)
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('INVALID_ROLE')
  })

  it('returns NOT_FOUND for a non-existent task', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('role-cmd-test')
    store.close()

    const envelope = await runRole(['set', 'does-not-exist', 'implementor'], dir)
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('NOT_FOUND')
  })
})
