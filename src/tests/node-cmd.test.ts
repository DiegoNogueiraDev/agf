/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Coverage: src/cli/commands/node-cmd.ts — `node update --patch-search/--patch-replace`.
 *
 * Wires the dormant diff-edit lever (src/core/economy/diff-edit.ts) into `agf node
 * update`: patch a substring of the current description instead of resending the
 * whole field via --description — output/input proportional to the change size.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { nodeCommand } from '../cli/commands/node-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function makeNode(id: string, description: string): GraphNode {
  const now = new Date().toISOString()
  return {
    id,
    type: 'task',
    title: 'patch target',
    description,
    status: 'backlog',
    priority: 3,
    acceptanceCriteria: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
  }
}

async function runNode(
  dir: string,
  args: string[],
): Promise<{ ok: boolean; data: unknown; code?: string; error?: string }> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  const prevExit = process.exitCode
  await nodeCommand().parseAsync(args, { from: 'user' })
  spy.mockRestore()
  process.exitCode = prevExit
  const line = out
    .join('')
    .trim()
    .split('\n')
    .find((l) => l.includes('"ok"'))
  return JSON.parse(line ?? '{}')
}

describe('agf node update --patch-search/--patch-replace (diff-edit economy lever)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-node-patch-'))
    const store = SqliteStore.open(dir)
    store.initProject('node-patch-test')
    store.insertNode(makeNode('node_patch_target', 'line one\nold region\nline three'))
    store.close()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('AC1: replaces only the matched region, leaving the rest of the description intact', async () => {
    const env = await runNode(dir, [
      'update',
      'node_patch_target',
      '--patch-search',
      'old region',
      '--patch-replace',
      'new region',
      '-d',
      dir,
    ])
    expect(env.ok).toBe(true)

    const store = SqliteStore.open(dir)
    const node = store.getNodeById('node_patch_target')
    store.close()
    expect(node?.description).toBe('line one\nnew region\nline three')
  })

  it('AC2: search string not found in current description → fails with PATCH_NOT_FOUND, node unchanged', async () => {
    const env = await runNode(dir, [
      'update',
      'node_patch_target',
      '--patch-search',
      'does not exist',
      '--patch-replace',
      'x',
      '-d',
      dir,
    ])
    expect(env.ok).toBe(false)
    expect(env.code).toBe('PATCH_NOT_FOUND')

    const store = SqliteStore.open(dir)
    const node = store.getNodeById('node_patch_target')
    store.close()
    expect(node?.description).toBe('line one\nold region\nline three')
  })

  it('AC3: combining --patch-search with --description is rejected as ambiguous', async () => {
    const env = await runNode(dir, [
      'update',
      'node_patch_target',
      '--description',
      'whole new description',
      '--patch-search',
      'old region',
      '--patch-replace',
      'new region',
      '-d',
      dir,
    ])
    expect(env.ok).toBe(false)
    expect(env.code).toBe('INVALID_INPUT')
  })
})

describe('agf node status — honesty invariant for externally-blocked nodes', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-node-status-honesty-'))
    const store = SqliteStore.open(dir)
    store.initProject('node-status-honesty-test')
    const now = new Date().toISOString()
    store.insertNode({
      id: 'node_infra_blocked',
      type: 'task',
      title: 'provision Vault secret',
      status: 'in_progress',
      priority: 3,
      blocked: true,
      metadata: { blockReason: 'Vault secret provisioning pending' },
      acceptanceCriteria: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses to mark an externally-blocked node done, even without --force', async () => {
    const env = await runNode(dir, ['status', 'node_infra_blocked', 'done', '-d', dir])
    expect(env.ok).toBe(false)
    expect(env.code).toBe('EXTERNAL_BLOCKED_DONE')

    const store = SqliteStore.open(dir)
    const node = store.getNodeById('node_infra_blocked')
    store.close()
    expect(node?.status).toBe('in_progress')
  })

  it('refuses to mark an externally-blocked node done even with --force', async () => {
    const env = await runNode(dir, ['status', 'node_infra_blocked', 'done', '--force', '-d', dir])
    expect(env.ok).toBe(false)
    expect(env.code).toBe('EXTERNAL_BLOCKED_DONE')
  })

  it('still allows a non-done transition on an externally-blocked node', async () => {
    const env = await runNode(dir, ['status', 'node_infra_blocked', 'blocked', '-d', dir])
    expect(env.ok).toBe(true)
  })
})
