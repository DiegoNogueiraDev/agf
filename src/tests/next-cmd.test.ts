/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/next-cmd.ts — nextCommand factory wiring.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nextCommand } from '../cli/commands/next-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'

describe('nextCommand', () => {
  it('builds the "next" command with a description', () => {
    const cmd = nextCommand()
    expect(cmd.name()).toBe('next')
    expect(cmd.description().length).toBeGreaterThan(0)
  })
  it('declares options or subcommands', () => {
    const cmd = nextCommand()
    expect(cmd.options.length + cmd.commands.length).toBeGreaterThan(0)
  })
})

describe('nextCommand — AGF_AGENT_ID env fallback (node_wire_7d739490fe72 — resolve-agent-id wire)', () => {
  let dir: string
  const originalEnv = process.env.AGF_AGENT_ID

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (originalEnv === undefined) delete process.env.AGF_AGENT_ID
    else process.env.AGF_AGENT_ID = originalEnv
  })

  async function run(args: string[]): Promise<Record<string, unknown>> {
    const out: string[] = []
    const spy = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      await nextCommand().parseAsync(args, { from: 'user' })
    } finally {
      process.stdout.write = spy
    }
    return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
  }

  function seedTask(store: SqliteStore, id: string): void {
    const now = new Date().toISOString()
    store.insertNode({
      id,
      type: 'task',
      title: `Task ${id}`,
      status: 'backlog',
      priority: 2,
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
  }

  it('AGF_AGENT_ID env var alone (no --agent flag) triggers the atomic claim path', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-next-envagent-'))
    const store = SqliteStore.open(dir)
    store.initProject('next-envagent-test')
    seedTask(store, 't1')
    store.close()

    process.env.AGF_AGENT_ID = 'env-agent-42'
    const result = await run(['-d', dir])
    expect(result.ok).toBe(true)
    const data = result.data as { claim?: { agentId: string } }
    expect(data.claim?.agentId).toBe('env-agent-42')
  })

  it('an explicit --agent flag still takes priority over AGF_AGENT_ID', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-next-flagpriority-'))
    const store = SqliteStore.open(dir)
    store.initProject('next-flagpriority-test')
    seedTask(store, 't1')
    store.close()

    process.env.AGF_AGENT_ID = 'env-agent-should-not-win'
    const result = await run(['-d', dir, '--agent', 'flag-agent'])
    expect(result.ok).toBe(true)
    expect((result.data as { claim?: { agentId: string } }).claim?.agentId).toBe('flag-agent')
  })

  it('without --agent or AGF_AGENT_ID, the claim path is skipped (default behavior unchanged)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'agf-next-noagent-'))
    const store = SqliteStore.open(dir)
    store.initProject('next-noagent-test')
    seedTask(store, 't1')
    store.close()

    delete process.env.AGF_AGENT_ID
    const result = await run(['-d', dir])
    expect(result.ok).toBe(true)
    expect((result.data as { claim?: unknown }).claim).toBeUndefined()
  })
})
