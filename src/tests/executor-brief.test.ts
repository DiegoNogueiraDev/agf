/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Tests for ExecutorBrief core (T1, graph node node_25b00fda46a5).
 * Pure, deterministic data layer: turn a graph node into a delegation spec.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import {
  buildExecutorBrief,
  buildEnrichedBrief,
  renderBriefMarkdown,
  renderBriefPrompt,
} from '../core/context/executor-brief.js'
import { recordArtifact } from '../core/reuse/artifact-cache.js'
import { computeTaskSignature } from '../core/reuse/task-signature.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

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

function makeEdge(overrides: Partial<GraphEdge> & Pick<GraphEdge, 'id' | 'from' | 'to' | 'relationType'>): GraphEdge {
  return {
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('buildExecutorBrief', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('executor-brief-test')
  })
  afterEach(() => {
    store.close()
  })

  it('auto-fills intent, acceptance criteria, and task fields from a node', () => {
    const ac = ['Given X, when Y, then Z', 'Returns null when node missing']
    store.insertNode(
      makeNode({
        id: 'node_alpha',
        title: 'Build the thing',
        description: 'A precise description of the thing to build',
        type: 'task',
        xpSize: 'S',
        estimateMinutes: 90,
        acceptanceCriteria: ac,
      }),
    )

    const brief = buildExecutorBrief(store, 'node_alpha')
    expect(brief).not.toBeNull()
    if (!brief) throw new Error('brief is null')

    expect(brief.intent).toBe('A precise description of the thing to build')
    expect(brief.acceptanceCriteria).toEqual(ac)
    expect(brief.task.id).toBe('node_alpha')
    expect(brief.task.type).toBe('task')
    expect(brief.task.title).toBe('Build the thing')
    expect(brief.task.xpSize).toBe('S')
    expect(brief.task.estimateMinutes).toBe(90)
  })

  it('falls back to title for intent when no description', () => {
    store.insertNode(makeNode({ id: 'node_no_desc', title: 'Title only' }))
    const brief = buildExecutorBrief(store, 'node_no_desc')
    expect(brief?.intent).toBe('Title only')
  })

  it('has judgment placeholders and populated doctrine constants', () => {
    store.insertNode(makeNode({ id: 'node_const', title: 'Const task' }))
    const brief = buildExecutorBrief(store, 'node_const')
    if (!brief) throw new Error('brief is null')

    // Judgment placeholders
    expect(brief.imitate).toContain('<fill:')
    expect(brief.readTouch).toContain('<fill:')
    expect(brief.contract).toContain('<fill:')
    expect(brief.testWith).toContain('<fill:')

    // Constants populated
    expect(brief.notList).toEqual([
      'não criar deps novas',
      'não refatorar vizinhos',
      'não mudar defaults',
      'não tocar hot-path',
    ])
    expect(brief.uncertainty).toBe(
      'se o contrato falhar ou faltar info, PARE e reporte; se ambíguo, escolha e justifique em 1 linha',
    )
    expect(brief.selfReview).toEqual([
      'sobrou placeholder?',
      'escopo vazou?',
      'todos os AC cobertos?',
      'default preservado?',
    ])
    expect(brief.dod).toEqual(['typecheck', 'file test', 'blast', 'lint'])
    expect(brief.returnSchema).toBe('{arquivos[], testes{passed,failed}, desvios[]}')
  })

  it('derives budget from xpSize with S default when missing', () => {
    store.insertNode(makeNode({ id: 'node_xs', title: 't', xpSize: 'XS' }))
    store.insertNode(makeNode({ id: 'node_m', title: 't', xpSize: 'M' }))
    store.insertNode(makeNode({ id: 'node_l', title: 't', xpSize: 'L' }))
    store.insertNode(makeNode({ id: 'node_none', title: 't' }))

    expect(buildExecutorBrief(store, 'node_xs')?.budget).toBe('~1–2 arquivos, sem deps, sem hot-path')
    expect(buildExecutorBrief(store, 'node_m')?.budget).toBe('~3–5 arquivos, sem deps')
    expect(buildExecutorBrief(store, 'node_l')?.budget).toBe('decompor antes; >5 arquivos')
    expect(buildExecutorBrief(store, 'node_none')?.budget).toBe('~1–2 arquivos, sem deps, sem hot-path')
  })

  it('readyToDelegate true when no blockers and all deps resolved', () => {
    store.insertNode(makeNode({ id: 'node_dep_done', title: 'dep', status: 'done' }))
    store.insertNode(makeNode({ id: 'node_ready', title: 'ready task' }))
    store.insertEdge(makeEdge({ id: 'e_dep_ok', from: 'node_ready', to: 'node_dep_done', relationType: 'depends_on' }))

    const brief = buildExecutorBrief(store, 'node_ready')
    expect(brief?.readyToDelegate).toBe(true)
    expect(brief?.blockers).toEqual([])
  })

  it('readyToDelegate false when an unresolved depends_on exists', () => {
    store.insertNode(makeNode({ id: 'node_dep_open', title: 'open dep', status: 'in_progress' }))
    store.insertNode(makeNode({ id: 'node_blocked_dep', title: 'blocked by dep' }))
    store.insertEdge(
      makeEdge({ id: 'e_dep_open', from: 'node_blocked_dep', to: 'node_dep_open', relationType: 'depends_on' }),
    )

    const brief = buildExecutorBrief(store, 'node_blocked_dep')
    expect(brief?.readyToDelegate).toBe(false)
  })

  it('readyToDelegate false and blockers reflected when a blocks edge exists', () => {
    store.insertNode(makeNode({ id: 'node_blocker', title: 'the blocker' }))
    store.insertNode(makeNode({ id: 'node_target', title: 'blocked target' }))
    store.insertEdge(makeEdge({ id: 'e_blocks', from: 'node_blocker', to: 'node_target', relationType: 'blocks' }))

    const brief = buildExecutorBrief(store, 'node_target')
    expect(brief?.readyToDelegate).toBe(false)
    expect(brief?.blockers).toEqual([{ id: 'node_blocker', title: 'the blocker' }])
  })

  it('blastRadius includes sourceRef file when present, [] otherwise', () => {
    store.insertNode(
      makeNode({
        id: 'node_with_src',
        title: 'has source',
        sourceRef: { file: 'src/core/foo.ts', startLine: 10 },
      }),
    )
    store.insertNode(makeNode({ id: 'node_no_src', title: 'no source' }))

    expect(buildExecutorBrief(store, 'node_with_src')?.blastRadius[0]).toBe('src/core/foo.ts')
    expect(buildExecutorBrief(store, 'node_no_src')?.blastRadius).toEqual([])
  })

  it('returns null for a missing node', () => {
    expect(buildExecutorBrief(store, 'node_does_not_exist')).toBeNull()
  })
})

describe('renderBriefMarkdown', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('executor-brief-render-test')
  })
  afterEach(() => {
    store.close()
  })

  it('contains the labeled sections and the node AC text', () => {
    const ac = ['Given X, when Y, then Z']
    store.insertNode(
      makeNode({ id: 'node_md', title: 'Render me', description: 'do the render', acceptanceCriteria: ac }),
    )
    const brief = buildExecutorBrief(store, 'node_md')
    if (!brief) throw new Error('brief is null')
    const md = renderBriefMarkdown(brief)

    for (const label of ['Intenção', 'AC', 'NÃO', 'DoD', 'Self-review', 'Retorne']) {
      expect(md).toContain(label)
    }
    expect(md).toContain('Given X, when Y, then Z')
    expect(md).toContain('node_md')
    expect(md).toMatch(/ready to delegate: (yes|no)/)
  })

  it('renders <fill: …> placeholders verbatim', () => {
    store.insertNode(makeNode({ id: 'node_md2', title: 't' }))
    const brief = buildExecutorBrief(store, 'node_md2')
    if (!brief) throw new Error('brief is null')
    expect(renderBriefMarkdown(brief)).toContain('<fill:')
  })

  it('is deterministic (same input → same output)', () => {
    store.insertNode(makeNode({ id: 'node_md3', title: 't', description: 'd' }))
    const brief = buildExecutorBrief(store, 'node_md3')
    if (!brief) throw new Error('brief is null')
    expect(renderBriefMarkdown(brief)).toBe(renderBriefMarkdown(brief))
  })
})

describe('renderBriefPrompt', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('executor-brief-prompt-test')
  })
  afterEach(() => {
    store.close()
  })

  it('returns a non-empty deterministic string', () => {
    store.insertNode(
      makeNode({ id: 'node_p', title: 'Prompt task', description: 'do the prompt', acceptanceCriteria: ['AC one'] }),
    )
    const brief = buildExecutorBrief(store, 'node_p')
    if (!brief) throw new Error('brief is null')
    const prompt = renderBriefPrompt(brief)
    expect(prompt.length).toBeGreaterThan(0)
    expect(prompt).toBe(renderBriefPrompt(brief))
    expect(prompt).toContain('node_p')
  })
})

describe('buildEnrichedBrief (shared prep)', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('executor-brief-enriched-test')
  })
  afterEach(() => {
    store.close()
  })

  it('renders byte-identical to the core brief when nothing is injectable', async () => {
    store.insertNode(makeNode({ id: 'node_plain', title: 'Plain', description: 'd' }))
    const core = buildExecutorBrief(store, 'node_plain')
    const enriched = await buildEnrichedBrief(store, 'node_plain')
    if (!core || !enriched) throw new Error('brief is null')
    expect(enriched.repoMap).toBeUndefined()
    expect(enriched.priorMemories).toBeUndefined()
    expect(enriched.reuseHint).toBeUndefined()
    expect(renderBriefMarkdown(enriched)).toBe(renderBriefMarkdown(core))
    expect(renderBriefPrompt(enriched)).toBe(renderBriefPrompt(core))
  })

  it('attaches a reuse hint when a green artifact matches the signature', async () => {
    store.insertNode(makeNode({ id: 'node_reuse', title: 'Reusable brief', type: 'task' }))
    const sig = computeTaskSignature({ title: 'Reusable brief', type: 'task', acceptanceCriteria: [], tags: [] })
    recordArtifact(store.getDb(), {
      id: 'art_b1',
      signature: sig,
      nodeId: 'node_prev',
      appliedEdits: [{ path: 'm.ts', oldString: 'a', newString: 'b' }],
      outcome: 'success',
      createdAt: Date.now(),
    })
    const enriched = await buildEnrichedBrief(store, 'node_reuse')
    if (!enriched) throw new Error('brief is null')
    expect(enriched.reuseHint).toContain('exact match')
    expect(renderBriefPrompt(enriched)).toContain('Reuse:')
  })

  it('returns null for a missing node (same contract as the core)', async () => {
    expect(await buildEnrichedBrief(store, 'ghost')).toBeNull()
  })
})
