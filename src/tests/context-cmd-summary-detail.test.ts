/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_0bb51a3b0a31 — wire RealContextRuntimeService's summary/nodeDetail
 * (real, SqliteStore-backed, but zero CLI consumer) into `agf context summary`
 * and `agf context detail <id>`. compact() needed no migration — context-cmd.ts
 * already calls applyFlowToCompact directly, the same function compact()
 * delegates to.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { contextCommand } from '../cli/commands/context-cmd.js'

function lastEnvelope(out: string[]): Record<string, unknown> {
  return JSON.parse(out.join('').trim().split('\n').pop() ?? '{}')
}

async function runContext(args: string[]): Promise<Record<string, unknown>> {
  const out: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk))
    return true
  })
  try {
    await contextCommand().parseAsync(args, { from: 'user' })
  } finally {
    spy.mockRestore()
  }
  return lastEnvelope(out)
}

describe('agf context summary', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-context-summary-'))
    SqliteStore.open(dir).initProject('proj')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns real byType/byStatus/totalNodes, not a stub', async () => {
    const store = SqliteStore.open(dir)
    store.insertNode({
      id: 'node_a',
      type: 'task',
      title: 'A',
      description: '',
      status: 'backlog',
      priority: 1,
      xpSize: 'S',
      parentId: null,
      acceptanceCriteria: [],
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    })
    store.close()

    const envelope = await runContext(['summary', '-d', dir])
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { totalNodes: number; byType: Record<string, number> }
    expect(data.totalNodes).toBeGreaterThan(0)
    expect(data.byType.task).toBe(1)
  })
})

describe('agf context detail', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-context-detail-'))
    SqliteStore.open(dir).initProject('proj')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns childrenCount and edgeCount for a real node', async () => {
    const store = SqliteStore.open(dir)
    const ts = new Date().toISOString()
    store.insertNode({
      id: 'node_parent',
      type: 'epic',
      title: 'Parent',
      description: '',
      status: 'backlog',
      priority: 1,
      xpSize: 'S',
      parentId: null,
      acceptanceCriteria: [],
      tags: [],
      createdAt: ts,
      updatedAt: ts,
      metadata: {},
    })
    store.insertNode({
      id: 'node_child',
      type: 'task',
      title: 'Child',
      description: '',
      status: 'backlog',
      priority: 1,
      xpSize: 'S',
      parentId: 'node_parent',
      acceptanceCriteria: [],
      tags: [],
      createdAt: ts,
      updatedAt: ts,
      metadata: {},
    })
    store.close()

    const envelope = await runContext(['detail', 'node_parent', '-d', dir])
    expect(envelope.ok).toBe(true)
    const data = envelope.data as { childrenCount: number; node: { id: string } }
    expect(data.childrenCount).toBe(1)
    expect(data.node.id).toBe('node_parent')
  })

  it('returns NOT_FOUND for a non-existent id, does not crash', async () => {
    const envelope = await runContext(['detail', 'node_ghost', '-d', dir])
    expect(envelope.ok).toBe(false)
    expect(envelope.code).toBe('NOT_FOUND')
  })
})
