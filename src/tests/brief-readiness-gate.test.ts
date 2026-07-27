/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * WIRE: brief-readiness gate — validateBriefReady (executor-brief.ts:178)
 * is called by brief-cmd.ts before emitting. Dormant capability: validator
 * existed, wire was missing. Now gated: unfilled <fill:> fields → BRIEF_NOT_READY;
 * --draft bypasses the gate with a warning.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { briefCommand } from '../cli/commands/brief-cmd.js'
import { validateBriefReady } from '../core/context/executor-brief.js'
import type { GraphNode } from '../core/graph/graph-types.js'
import type { ExecutorBrief } from '../core/context/executor-brief.js'

interface Envelope {
  ok: boolean
  code?: string
  error?: string
  data?: Record<string, unknown>
  task?: { id: string }
}

function lastEnvelope(captured: string[]): Envelope {
  const objs = captured
    .join('')
    .trim()
    .split('\n')
    .filter((l) => l.trim().startsWith('{') && l.includes('"ok"'))
  return JSON.parse(objs[objs.length - 1]) as Envelope
}

describe('brief-readiness gate', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agf-brief-ready-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  function seedNode(id: string): void {
    const store = SqliteStore.open(dir)
    store.initProject('brief-ready-test')
    const now = new Date().toISOString()
    store.insertNode({
      id,
      type: 'task',
      title: 'Test task',
      description: 'A test task with <fill:> fields',
      status: 'backlog',
      priority: 3,
      acceptanceCriteria: ['Given an input, When processed, Then output'],
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()
  }

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

  it('BRIEF_NOT_READY when judgment fields have <fill:> placeholders', async () => {
    seedNode('node_unfilled')
    const env = await runBrief(['node_unfilled', '-d', dir, '--format', 'json'])
    expect(env.ok).toBe(false)
    expect(env.code).toBe('BRIEF_NOT_READY')
    expect(Array.isArray((env.data as Record<string, unknown>)?.unfilled)).toBe(true)
    expect((env.data as Record<string, unknown>).unfilled).toContain('contract')
  })

  it('--draft emits the brief with a BRIEF_DRAFT warning when unfilled', async () => {
    seedNode('node_draft')
    const env = await runBrief(['node_draft', '-d', dir, '--format', 'json', '--draft'])
    expect(env.ok).toBe(true)
    expect(env.code).toBe('BRIEF_DRAFT')
    expect(env.data?.task).toBeDefined()
    expect(Array.isArray((env.data as Record<string, unknown>)?.unfilled)).toBe(true)
  })

  it('returns NOT_FOUND for a non-existent node (not validator exception)', async () => {
    const store = SqliteStore.open(dir)
    store.initProject('brief-ready-test')
    store.close()
    const env = await runBrief(['node_missing', '-d', dir])
    expect(env.ok).toBe(false)
    expect(env.code).toBe('NOT_FOUND')
  })

  it('validateBriefReady returns ready=true when all judgment fields are filled', () => {
    const brief: ExecutorBrief = {
      intent: 'Implement feature X',
      task: { id: 'node_x', type: 'task', title: 'Feature X' },
      imitate: 'src/examples/foo.ts',
      readTouch: 'src/core/bar.ts:42',
      contract: 'function doX(input: string): Result',
      acceptanceCriteria: ['Given input, When processed, Then output'],
      notList: [],
      blastRadius: ['src/file.ts'],
      budget: '~1-2 arquivos, sem deps',
      uncertainty: 'report; ambiguous → choose and justify in 1 line',
      testWith: 'new Database(":memory:")',
      dod: ['typecheck', 'test', 'blast', 'lint'],
      selfReview: ['placeholder?'],
      returnSchema: '{"files":[],"tests":{"passed":0,"failed":0},"desvios":[]}',
      readyToDelegate: true,
      blockers: [],
    }
    const result = validateBriefReady(brief)
    expect(result.ready).toBe(true)
    expect(result.unfilled).toEqual([])
  })
})
