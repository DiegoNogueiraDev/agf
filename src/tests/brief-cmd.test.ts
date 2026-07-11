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
import { buildEnrichedBrief, economyDirectiveFor, renderBriefMarkdown } from '../core/context/executor-brief.js'
import type { RagOutDecision, ScaffoldDescriptor } from '../core/rag-out/gate.js'

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

describe('brief diff-edit economy directive (node_46ef75d7a084)', () => {
  const scaffold: ScaffoldDescriptor = {
    id: 'sc_prd',
    goal: 'write a PRD with phases and metrics',
    fitTags: ['prd', 'phases', 'metrics'],
    slots: ['vision', 'objectives'],
    noveltyFloor: 0,
    structureRef: 'templates/prd.md',
  }

  function seedNode(dir: string, id: string, title: string): void {
    const store = SqliteStore.open(dir)
    store.initProject('brief-directive')
    const now = new Date().toISOString()
    store.insertNode({
      id,
      type: 'task',
      title,
      status: 'backlog',
      priority: 3,
      acceptanceCriteria: ['Given an id, returns the brief'],
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as GraphNode)
    store.close()
  }

  it('economyDirectiveFor: a recover decision yields a diff-edit directive with the scaffold path', () => {
    const decision: RagOutDecision = {
      decision: 'recover',
      goal: 'write a PRD',
      confidence: 0.9,
      best: scaffold,
      candidates: [{ scaffold, score: 0.9 }],
      reason: 'match',
    }
    const d = economyDirectiveFor(decision)
    expect(d?.mode).toBe('diff-edit')
    expect(d?.scaffoldPath).toBe('templates/prd.md')
    expect(d?.instruction).toContain('diff-edit')
    expect(d?.instruction).toContain('templates/prd.md')
    expect(d?.instruction).toContain('regenere')
  })

  it('AC2: economyDirectiveFor: a generate decision (green-field) yields no directive', () => {
    const decision: RagOutDecision = {
      decision: 'generate',
      goal: 'unrelated',
      confidence: 0,
      best: null,
      candidates: [],
      reason: 'no_match',
    }
    expect(economyDirectiveFor(decision)).toBeUndefined()
  })

  it('AC1: buildEnrichedBrief sets + renders economyDirective when a corpus scaffold matches', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-brief-diff-on-'))
    try {
      seedNode(dir, 'node_prd', 'write a PRD with phases and metrics')
      const store = SqliteStore.open(dir)
      const brief = await buildEnrichedBrief(store, 'node_prd', { projectDir: dir, scaffoldCorpus: [scaffold] })
      store.close()
      expect(brief?.economyDirective?.scaffoldPath).toBe('templates/prd.md')
      expect(renderBriefMarkdown(brief as NonNullable<typeof brief>)).toContain('templates/prd.md')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('AC2: a green-field task (empty corpus) → no economyDirective and no diff-edit text in the brief', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agf-brief-diff-off-'))
    try {
      seedNode(dir, 'node_gf', 'implement an unrelated widget xyz')
      const store = SqliteStore.open(dir)
      const brief = await buildEnrichedBrief(store, 'node_gf', { projectDir: dir, scaffoldCorpus: [] })
      store.close()
      expect(brief?.economyDirective).toBeUndefined()
      expect(renderBriefMarkdown(brief as NonNullable<typeof brief>)).not.toContain('diff-edit')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
