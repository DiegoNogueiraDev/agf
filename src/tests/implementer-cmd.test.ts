/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/implementer-cmd.ts — `agf implementer`.
 * Wires the dormant src/core/implementer/validation.ts (Zod boundary
 * validation for nodeId/action/agentId) into a CLI surface: agent-attributed
 * lifecycle transitions (start/progress/done) on a task node.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { implementerCommand } from '../cli/commands/implementer-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function makeNode(id: string, status: GraphNode['status']): GraphNode {
  const now = new Date().toISOString()
  return {
    id,
    type: 'task',
    title: 'implementer target',
    description: 'test node',
    status,
    priority: 3,
    acceptanceCriteria: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
  }
}

async function runImplementer(
  dir: string,
  args: string[],
): Promise<{ ok: boolean; data?: unknown; code?: string; error?: string }> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  const prevExit = process.exitCode
  await implementerCommand().parseAsync(args, { from: 'user' })
  spy.mockRestore()
  process.exitCode = prevExit
  const line = out
    .join('')
    .trim()
    .split('\n')
    .find((l) => l.includes('"ok"'))
  return JSON.parse(line ?? '{}')
}

describe('agf implementer (dormant validation.ts wiring)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-implementer-'))
    const store = SqliteStore.open(dir)
    store.initProject('implementer-test')
    store.insertNode(makeNode('node_impl_target', 'backlog'))
    store.close()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('AC1: --action start moves backlog → in_progress and records the agent', async () => {
    const env = await runImplementer(dir, ['node_impl_target', '--action', 'start', '--agent-id', 'agent-7', '-d', dir])
    expect(env.ok).toBe(true)

    const store = SqliteStore.open(dir)
    const node = store.getNodeById('node_impl_target')
    store.close()
    expect(node?.status).toBe('in_progress')
    expect(node?.metadata?.lastAgentId).toBe('agent-7')
  })

  it('AC2: --action done from backlog is an invalid status_flow transition', async () => {
    const env = await runImplementer(dir, ['node_impl_target', '--action', 'done', '-d', dir])
    expect(env.ok).toBe(false)
    expect(env.code).toBe('INVALID_TRANSITION')

    const store = SqliteStore.open(dir)
    const node = store.getNodeById('node_impl_target')
    store.close()
    expect(node?.status).toBe('backlog')
  })

  it('AC3: invalid input (missing nodeId) fails validation before touching the store', async () => {
    const env = await runImplementer(dir, ['', '--action', 'start', '-d', dir])
    expect(env.ok).toBe(false)
    expect(env.code).toBe('VALIDATION_ERROR')
  })

  it('AC4: unknown node id fails with NOT_FOUND', async () => {
    const env = await runImplementer(dir, ['node_does_not_exist', '--action', 'start', '-d', dir])
    expect(env.ok).toBe(false)
    expect(env.code).toBe('NOT_FOUND')
  })
})
