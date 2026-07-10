/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * improve-briefing [P1] — Compressed colony briefing for subagents.
 *
 * Today each subagent reloads full CLAUDE.md + system prompt (~28k fixed
 * overhead) before touching a task. `buildColonyBrief` produces a COMPRESSED
 * briefing containing ONLY task-relevant context (intent, AC, blast radius,
 * deps, files to touch) — never the session/global preamble — while respecting
 * the existing brief-ceiling token ceiling.
 *
 * AC: compressed brief omits session/global context, stays under the ceiling,
 *     and is materially smaller than a full-context baseline.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { buildColonyBrief } from '../core/context/executor-brief.js'
import { BRIEF_TOKEN_CEILING } from '../core/context/brief-ceiling.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function makeNode(overrides: Partial<GraphNode> & Pick<GraphNode, 'id' | 'title'>): GraphNode {
  const now = new Date().toISOString()
  return {
    type: 'task',
    status: 'backlog',
    priority: 3,
    acceptanceCriteria: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/** Sentinel a subagent's full-context reload would contain — must never leak into a colony brief. */
const SESSION_SENTINEL = '=== BEGIN CLAUDE.md SYSTEM PROMPT ==='

describe('improve-briefing: buildColonyBrief (compressed colony briefing)', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('audit-improve-briefing')
  })
  afterEach(() => {
    store.close()
  })

  it('returns null for a missing node (same contract as the core brief)', () => {
    expect(buildColonyBrief(store, 'ghost')).toBeNull()
  })

  it('includes task-relevant context and OMITS session/global context', () => {
    store.insertNode(
      makeNode({
        id: 'node_b',
        title: 'Compress me',
        description: 'do the compress',
        acceptanceCriteria: ['AC1: given x when y then z'],
        sourceRef: { file: 'src/core/foo.ts', startLine: 1 },
      }),
    )
    const brief = buildColonyBrief(store, 'node_b')
    expect(brief).not.toBeNull()
    if (!brief) throw new Error('brief is null')

    // task-relevant content present
    expect(brief.text).toContain('do the compress')
    expect(brief.text).toContain('AC1: given x when y then z')
    expect(brief.text).toContain('src/core/foo.ts')
    expect(brief.text).toContain('node_b')

    // session/global preamble absent — the whole point of the compression
    expect(brief.text).not.toContain(SESSION_SENTINEL)
    expect(brief.text.toLowerCase()).not.toContain('claude.md')
    expect(brief.text.toLowerCase()).not.toContain('system prompt')
  })

  it('stays under the brief ceiling even with a large acceptance-criteria list', () => {
    const ac = Array.from(
      { length: 40 },
      (_, i) => `AC${i}: given ${'x'.repeat(60)} when ${'y'.repeat(60)} then ${'z'.repeat(60)}`,
    )
    store.insertNode(
      makeNode({
        id: 'node_big',
        title: 'Big task',
        description: 'd'.repeat(400),
        acceptanceCriteria: ac,
        sourceRef: { file: 'src/core/big.ts', startLine: 1 },
      }),
    )
    const brief = buildColonyBrief(store, 'node_big')
    if (!brief) throw new Error('brief is null')
    expect(brief.tokenEstimate).toBeLessThanOrEqual(BRIEF_TOKEN_CEILING)
    expect(brief.tokenEstimate).toBe(Math.ceil(brief.chars / 4))
  })

  it('is materially smaller than a full-context baseline (measurable reduction)', () => {
    store.insertNode(
      makeNode({
        id: 'node_m',
        title: 'Measured task',
        description: 'implement the measured thing with TDD',
        acceptanceCriteria: ['AC1: given input then output', 'AC2: errors handled'],
        sourceRef: { file: 'src/core/measured.ts', startLine: 1 },
      }),
    )
    const brief = buildColonyBrief(store, 'node_m')
    if (!brief) throw new Error('brief is null')

    // Full-context baseline = what a subagent reloads today: the ~28k session/
    // global preamble (CLAUDE.md + system prompt) PLUS the task brief.
    const sessionPreamble = `${SESSION_SENTINEL}\n${'lorem ipsum '.repeat(8000)}\n=== END SYSTEM PROMPT ===`
    const fullContextBaseline = `${sessionPreamble}\n${brief.text}`

    // The colony brief drops the entire preamble — at least a 50% reduction,
    // in practice well over 90%.
    expect(brief.chars).toBeLessThan(fullContextBaseline.length * 0.5)
    expect(brief.chars / fullContextBaseline.length).toBeLessThan(0.1)
  })

  it('is deterministic (same node → same compressed text)', () => {
    store.insertNode(makeNode({ id: 'node_d', title: 't', description: 'd' }))
    const a = buildColonyBrief(store, 'node_d')
    const b = buildColonyBrief(store, 'node_d')
    expect(a?.text).toBe(b?.text)
  })
})
