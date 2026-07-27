/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_b0600892ca5e — TOC trigger: when the waiting queue (blocked + awaiting)
 * crosses a configurable multiple of in_progress, `agf next` carries a structured
 * tocSignal {kind:'validate_backlog', counts, suggestion} — a non-blocking signal
 * (Goldratt TOC: elevate the bottleneck before producing more; Little CT=WIP/TH).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectValidateBacklogSignal } from '../core/insights/bottleneck-detector.js'
import { nextCommand } from '../cli/commands/next-cmd.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode } from '../core/graph/graph-types.js'

describe('detectValidateBacklogSignal — pure TOC threshold', () => {
  it('emits validate_backlog when waiting (blocked+awaiting) >= 2x in_progress', () => {
    const signal = detectValidateBacklogSignal({ in_progress: 1, blocked: 1, ready: 1 })
    expect(signal).not.toBeNull()
    expect(signal!.kind).toBe('validate_backlog')
    expect(signal!.counts).toMatchObject({ inProgress: 1, blocked: 1, awaiting: 1, waiting: 2 })
    expect(signal!.suggestion.length).toBeGreaterThan(0)
  })

  it('returns null below the threshold (byte-identical output — no signal)', () => {
    expect(detectValidateBacklogSignal({ in_progress: 2, blocked: 1, ready: 1 })).toBeNull()
  })

  it('returns null when nothing is in_progress (no active production / empty graph)', () => {
    expect(detectValidateBacklogSignal({})).toBeNull()
    expect(detectValidateBacklogSignal({ blocked: 5, ready: 5 })).toBeNull()
  })

  it('honors a configurable multiplier', () => {
    const counts = { in_progress: 2, blocked: 2, ready: 2 } // waiting=4
    expect(detectValidateBacklogSignal(counts, 2)).not.toBeNull() // 4 >= 4
    expect(detectValidateBacklogSignal(counts, 3)).toBeNull() // 4 < 6
  })
})

describe('agf next — tocSignal in the envelope (consumer wire)', () => {
  let dir: string

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
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

  function seed(nodes: Array<Partial<GraphNode> & { id: string; status: string }>): SqliteStore {
    dir = mkdtempSync(join(tmpdir(), 'toc-'))
    const store = SqliteStore.open(dir)
    store.initProject('toc-test')
    const now = new Date().toISOString()
    for (const n of nodes) {
      store.insertNode({
        type: 'task',
        title: n.id,
        priority: 3,
        acceptanceCriteria: [],
        tags: [],
        createdAt: now,
        updatedAt: now,
        ...n,
      } as GraphNode)
    }
    store.close()
    return store
  }

  it('AC1: waiting >= 2x in_progress → envelope carries tocSignal and the pull is NOT blocked', async () => {
    seed([
      { id: 'ip', status: 'in_progress', metadata: { claimedBy: 'other-ant' } },
      { id: 'b1', status: 'blocked' },
      { id: 'b2', status: 'blocked' },
      { id: 'pull-me', status: 'backlog' },
    ])
    const env = await run(['-d', dir])
    expect(env.ok).toBe(true) // pull not blocked
    const data = env.data as Record<string, unknown>
    expect(data.node).toBeTruthy()
    const toc = data.tocSignal as { kind: string; counts: Record<string, number> } | undefined
    expect(toc?.kind).toBe('validate_backlog')
    expect(toc?.counts.inProgress).toBe(1)
    expect(toc?.counts.waiting).toBe(2)
  })

  it('AC2: below threshold → tocSignal absent (byte-identical to current)', async () => {
    seed([
      { id: 'ip', status: 'in_progress', metadata: { claimedBy: 'other-ant' } },
      { id: 'b1', status: 'blocked' },
      { id: 'pull-me', status: 'backlog' },
    ])
    const env = await run(['-d', dir])
    expect(env.ok).toBe(true)
    expect((env.data as Record<string, unknown>).tocSignal).toBeUndefined()
  })

  it('AC3: empty graph → no exception, no tocSignal', async () => {
    seed([])
    const env = await run(['-d', dir])
    // NO_TASKS is a fail envelope; either way no tocSignal and no throw.
    const data = (env.data ?? {}) as Record<string, unknown>
    expect(data.tocSignal).toBeUndefined()
  })
})
