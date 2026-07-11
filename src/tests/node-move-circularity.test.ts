/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_443e902bdd2c (dormancy harvest) — checkCircularity (utils/circularity.ts)
 * claimed via docblock to be "Used by node.ts, clone-node.ts, and move-node.ts", but
 * grep confirmed its only reference is the utils barrel re-export — zero real callers.
 * `agf node move <id> --parent <newParent>` updates parentId directly with no
 * circularity guard, so reparenting a node under its own descendant creates a real
 * cycle in the graph tree.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { generateId } from '../core/utils/id.js'
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

describe('node_443e902bdd2c: agf node move refuses to create a circular parent chain', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-node-move-circularity-'))
    SqliteStore.open(dir).initProject('proj')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('rejects moving a node to become the parent of its own ancestor (real cycle)', async () => {
    const store = SqliteStore.open(dir)
    const now = new Date().toISOString()
    const grandparent = generateId('node')
    const parent = generateId('node')
    const child = generateId('node')
    store.insertNode({
      id: grandparent,
      type: 'epic',
      title: 'Grandparent',
      status: 'backlog',
      priority: 3,
      createdAt: now,
      updatedAt: now,
    })
    store.insertNode({
      id: parent,
      type: 'task',
      title: 'Parent',
      status: 'backlog',
      priority: 3,
      parentId: grandparent,
      createdAt: now,
      updatedAt: now,
    })
    store.insertNode({
      id: child,
      type: 'task',
      title: 'Child',
      status: 'backlog',
      priority: 3,
      parentId: parent,
      createdAt: now,
      updatedAt: now,
    })
    store.close()

    // Attempt: make `grandparent` a child of `child` — grandparent is child's own ancestor.
    const envelope = await runNode(['move', grandparent, '--parent', child, '-d', dir])

    expect(envelope.ok).toBe(false)

    const verifyStore = SqliteStore.open(dir)
    const unchanged = verifyStore.getNodeById(grandparent)
    expect(unchanged?.parentId ?? null).toBeNull() // never mutated
    verifyStore.close()
  })

  it('allows a legitimate reparent to an unrelated node', async () => {
    const store = SqliteStore.open(dir)
    const now = new Date().toISOString()
    const oldParent = generateId('node')
    const newParent = generateId('node')
    const child = generateId('node')
    store.insertNode({
      id: oldParent,
      type: 'epic',
      title: 'Old parent',
      status: 'backlog',
      priority: 3,
      createdAt: now,
      updatedAt: now,
    })
    store.insertNode({
      id: newParent,
      type: 'epic',
      title: 'New parent',
      status: 'backlog',
      priority: 3,
      createdAt: now,
      updatedAt: now,
    })
    store.insertNode({
      id: child,
      type: 'task',
      title: 'Child',
      status: 'backlog',
      priority: 3,
      parentId: oldParent,
      createdAt: now,
      updatedAt: now,
    })
    store.close()

    const envelope = await runNode(['move', child, '--parent', newParent, '-d', dir])
    expect(envelope.ok).toBe(true)

    const verifyStore = SqliteStore.open(dir)
    expect(verifyStore.getNodeById(child)?.parentId).toBe(newParent)
    verifyStore.close()
  })

  it('rejects self-parenting', async () => {
    const store = SqliteStore.open(dir)
    const now = new Date().toISOString()
    const id = generateId('node')
    store.insertNode({
      id,
      type: 'task',
      title: 'Solo',
      status: 'backlog',
      priority: 3,
      createdAt: now,
      updatedAt: now,
    })
    store.close()

    const envelope = await runNode(['move', id, '--parent', id, '-d', dir])
    expect(envelope.ok).toBe(false)
  })
})
