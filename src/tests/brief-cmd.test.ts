/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Tests for `agf brief <id>` (T2, graph node node_309a378811ca).
 * Exposes the ExecutorBrief in 3 formats: markdown (default), json, claude-prompt.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { briefCommand } from '../cli/commands/brief-cmd.js'
import type { GraphNode } from '../core/graph/graph-types.js'

interface Envelope {
  ok: boolean
  code?: string
  error?: string
  data?: {
    markdown?: string
    prompt?: string
    acceptanceCriteria?: string[]
    task?: { id: string }
    intent?: string
  }
}

function lastEnvelope(captured: string[]): Envelope {
  const objs = captured
    .join('')
    .trim()
    .split('\n')
    .filter((l) => l.trim().startsWith('{') && l.includes('"ok"'))
  return JSON.parse(objs[objs.length - 1]) as Envelope
}

describe('brief command', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-brief-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  async function runBrief(args: string[]): Promise<Envelope> {
    const out: string[] = []
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk))
      return true
    })
    const prevExit = process.exitCode
    await briefCommand().parseAsync(args, { from: 'user' })
    spy.mockRestore()
    process.exitCode = prevExit
    return lastEnvelope(out)
  }

  function seedNode(): void {
    const store = SqliteStore.open(dir)
    store.initProject('brief-test')
    const now = new Date().toISOString()
    const node: GraphNode = {
      id: 'node_brief',
      type: 'task',
      title: 'Build the brief command',
      description: 'Expose ExecutorBrief via CLI',
      status: 'backlog',
      priority: 3,
      acceptanceCriteria: ['Given an id, returns markdown by default'],
      tags: [],
      createdAt: now,
      updatedAt: now,
    }
    store.insertNode(node)
    store.close()
  }

  it('returns markdown by default', async () => {
    seedNode()
    const env = await runBrief(['node_brief', '-d', dir])
    expect(env.ok).toBe(true)
    expect(typeof env.data?.markdown).toBe('string')
    expect(env.data?.markdown).toContain('Intenção')
  })

  it('--format json returns the ExecutorBrief object', async () => {
    seedNode()
    const env = await runBrief(['node_brief', '-d', dir, '--format', 'json'])
    expect(env.ok).toBe(true)
    expect(env.data?.task?.id).toBe('node_brief')
    expect(env.data?.acceptanceCriteria).toEqual(['Given an id, returns markdown by default'])
    expect(env.data?.intent).toBe('Expose ExecutorBrief via CLI')
  })

  it('--format claude-prompt returns a prompt string', async () => {
    seedNode()
    const env = await runBrief(['node_brief', '-d', dir, '--format', 'claude-prompt'])
    expect(env.ok).toBe(true)
    expect(typeof env.data?.prompt).toBe('string')
    expect((env.data?.prompt ?? '').length).toBeGreaterThan(0)
  })

  it('NOT_FOUND for a missing node id', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('brief-test')
    store.close()
    const env = await runBrief(['node_missing', '-d', dir])
    expect(env.ok).toBe(false)
    expect(env.code).toBe('NOT_FOUND')
  })

  it('INVALID_FORMAT on a bad --format', async () => {
    seedNode()
    const env = await runBrief(['node_brief', '-d', dir, '--format', 'xml'])
    expect(env.ok).toBe(false)
    expect(env.code).toBe('INVALID_FORMAT')
  })
})
