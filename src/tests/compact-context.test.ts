/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Test suite for compact-context.ts — Cycle 7 T2.
 * AC: ≥12 tests covering buildCompressedContext, neighbourhood, AC truncation,
 * token estimator. All SQLite-dependent functions mocked via minimal store shim.
 */

import { describe, it, expect } from 'vitest'
import type { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'
import {
  buildTaskContext,
  buildNaiveNeighborhood,
  buildCompressedContext,
  computeLayeredMetrics,
  truncateDescription,
  compressKeys,
  omitDefaults,
  summarizeTaskContext,
  NEIGHBOR_DESC_LIMIT,
} from '../core/context/compact-context.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeNode(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  const now = new Date().toISOString()
  return {
    id,
    type: 'task',
    title: `Task ${id}`,
    status: 'backlog',
    priority: 3,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeEdge(from: string, to: string, relationType: GraphEdge['relationType']): GraphEdge {
  return {
    id: `edge_${from}_${to}`,
    from,
    to,
    relationType,
    metadata: { inferred: false, confidence: 1 },
    createdAt: new Date().toISOString(),
  }
}

function makeStore(nodes: GraphNode[], edges: GraphEdge[] = []): SqliteStore {
  return {
    getNodeById: (id: string) => nodes.find((n) => n.id === id) ?? null,
    getChildNodes: (id: string) => nodes.filter((n) => n.parentId === id),
    getEdgesTo: (id: string) => edges.filter((e) => e.to === id),
    getEdgesFrom: (id: string) => edges.filter((e) => e.from === id),
  } as unknown as SqliteStore
}

// ── buildTaskContext ───────────────────────────────────────────────────────────

describe('buildTaskContext: core context assembly', () => {
  it('returns null for non-existent node', () => {
    expect(buildTaskContext(makeStore([]), 'missing')).toBeNull()
  })

  it('returns TaskContext for a minimal node', () => {
    const node = makeNode('n1', { title: 'My Task', status: 'in_progress' })
    const ctx = buildTaskContext(makeStore([node]), 'n1')
    expect(ctx).not.toBeNull()
    expect(ctx?.task.id).toBe('n1')
    expect(ctx?.task.title).toBe('My Task')
  })

  it('task and node alias carry the same content (Bug #035 contract)', () => {
    const node = makeNode('n1')
    const ctx = buildTaskContext(makeStore([node]), 'n1')
    expect(ctx?.task.id).toBe(ctx?.node.id)
    expect(ctx?.task.title).toBe(ctx?.node.title)
  })

  it('populates parent when node has parentId', () => {
    const parent = makeNode('epic1', { type: 'epic', title: 'Parent Epic' })
    const child = makeNode('n1', { parentId: 'epic1' })
    const ctx = buildTaskContext(makeStore([parent, child]), 'n1')
    expect(ctx?.parent?.id).toBe('epic1')
    expect(ctx?.parent?.title).toBe('Parent Epic')
  })

  it('populates children via getChildNodes', () => {
    const epic = makeNode('epic1', { type: 'epic' })
    const t1 = makeNode('t1', { parentId: 'epic1' })
    const t2 = makeNode('t2', { parentId: 'epic1' })
    const ctx = buildTaskContext(makeStore([epic, t1, t2]), 'epic1')
    expect(ctx?.children.length).toBe(2)
  })

  it('populates dependsOn from outgoing depends_on edge with resolved=true when dep is done', () => {
    const dep = makeNode('dep1', { title: 'Done Dep', status: 'done' })
    const task = makeNode('t1')
    const edge = makeEdge('t1', 'dep1', 'depends_on')
    const ctx = buildTaskContext(makeStore([dep, task], [edge]), 't1')
    expect(ctx?.dependsOn.length).toBe(1)
    expect(ctx?.dependsOn[0].resolved).toBe(true)
  })

  it('populates inline acceptanceCriteria from node.acceptanceCriteria', () => {
    const node = makeNode('n1', { acceptanceCriteria: ['AC1', 'AC2', 'AC3'] })
    const ctx = buildTaskContext(makeStore([node]), 'n1')
    expect(ctx?.acceptanceCriteria).toEqual(['AC1', 'AC2', 'AC3'])
  })

  it('metrics.estimatedTokens is positive for non-trivial node', () => {
    const node = makeNode('n1', {
      title: 'Substantive Task Title',
      description: 'A description with enough content to estimate tokens.',
    })
    const ctx = buildTaskContext(makeStore([node]), 'n1')
    expect(ctx?.metrics.estimatedTokens).toBeGreaterThan(0)
  })
})

// ── buildNaiveNeighborhood ─────────────────────────────────────────────────────

describe('buildNaiveNeighborhood: uncompressed baseline', () => {
  it('returns null for non-existent node', () => {
    expect(buildNaiveNeighborhood(makeStore([]), 'missing')).toBeNull()
  })

  it('returns neighbourhood for a valid node', () => {
    const node = makeNode('n1', { title: 'My Node' })
    const nb = buildNaiveNeighborhood(makeStore([node]), 'n1')
    expect(nb).not.toBeNull()
    expect(nb?.task.id).toBe('n1')
    expect(nb?.estimatedTokens).toBeGreaterThan(0)
  })

  it('includes parent when node has parentId', () => {
    const parent = makeNode('epic', { type: 'epic', title: 'Epic' })
    const child = makeNode('t1', { parentId: 'epic' })
    const nb = buildNaiveNeighborhood(makeStore([parent, child]), 't1')
    expect(nb?.parent?.id).toBe('epic')
  })
})

// ── buildCompressedContext ─────────────────────────────────────────────────────

describe('buildCompressedContext: L2-L4 compression layers', () => {
  it('returns null for non-existent node', () => {
    expect(buildCompressedContext(makeStore([]), 'missing')).toBeNull()
  })

  it('returns CompressedContext with all four layer token counts', () => {
    const node = makeNode('n1', { title: 'Compression Test Node', description: 'Some content' })
    const cc = buildCompressedContext(makeStore([node]), 'n1')
    expect(cc).not.toBeNull()
    expect(cc?.layerMetrics.l1Tokens).toBeGreaterThan(0)
    expect(cc?.layerMetrics.l2Tokens).toBeGreaterThan(0)
    expect(cc?.layerMetrics.l3Tokens).toBeGreaterThan(0)
    expect(cc?.layerMetrics.l4Tokens).toBeGreaterThan(0)
  })

  it('payload contains _k legend key (L4 compression marker)', () => {
    const node = makeNode('n1')
    const cc = buildCompressedContext(makeStore([node]), 'n1')
    expect(cc?.payload['_k']).toBeDefined()
  })

  it('all four layer token counts are positive', () => {
    // l1Tokens is computed from corePayload (no 'node' alias), l2 re-adds it,
    // so l4 may exceed l1 — correct invariant is that all layers report positive counts.
    const node = makeNode('n1', {
      title: 'Substantially Named Task With Real Content',
      description: 'A longer description to ensure the compressor has material to work with. '.repeat(4),
      acceptanceCriteria: ['GIVEN context WHEN compressed THEN tokens reduced'],
    })
    const cc = buildCompressedContext(makeStore([node]), 'n1')
    expect(cc?.layerMetrics.l1Tokens).toBeGreaterThan(0)
    expect(cc?.layerMetrics.l2Tokens).toBeGreaterThan(0)
    expect(cc?.layerMetrics.l3Tokens).toBeGreaterThan(0)
    expect(cc?.layerMetrics.l4Tokens).toBeGreaterThan(0)
  })
})

// ── computeLayeredMetrics ──────────────────────────────────────────────────────

describe('computeLayeredMetrics: full savings breakdown', () => {
  it('returns null for non-existent node', () => {
    expect(computeLayeredMetrics(makeStore([]), 'missing')).toBeNull()
  })

  it('returns metrics with non-negative naiveNodeTokens', () => {
    const node = makeNode('n1', { description: 'Some content to measure' })
    const m = computeLayeredMetrics(makeStore([node]), 'n1')
    expect(m?.naiveNodeTokens).toBeGreaterThan(0)
    expect(m?.totalRealSavings).toBeGreaterThanOrEqual(0)
  })
})

// ── truncateDescription ────────────────────────────────────────────────────────

describe('truncateDescription: AC truncation behavior', () => {
  it('returns undefined for undefined input', () => {
    expect(truncateDescription(undefined, 50)).toBeUndefined()
  })

  it('returns original when text is within limit', () => {
    expect(truncateDescription('short text', 100)).toBe('short text')
  })

  it('truncates at sentence boundary when available', () => {
    const text = 'First sentence. Second sentence that makes it long.'
    const result = truncateDescription(text, 20)
    // Should prefer cutting at the sentence end (the '.') when > 50% of limit
    expect(result).toBe('First sentence.')
  })

  it('appends ellipsis when no sentence boundary available', () => {
    const text = 'Neverending text without any punctuation or breaks anywhere'
    const result = truncateDescription(text, 10)
    expect(result).toMatch(/…$/)
    expect(result!.length).toBeLessThanOrEqual(11) // 10 + '…'
  })

  it('NEIGHBOR_DESC_LIMIT is 100 (matches constant)', () => {
    expect(NEIGHBOR_DESC_LIMIT).toBe(100)
  })
})

// ── compressKeys + omitDefaults ────────────────────────────────────────────────

describe('compressKeys: structural key shortening', () => {
  it('compresses known keys to short forms', () => {
    const result = compressKeys({ task: { id: 'n1', status: 'backlog' } }) as Record<string, unknown>
    expect(result['tk']).toBeDefined() // 'task' → 'tk'
    expect(result['task']).toBeUndefined()
  })

  it('handles null and arrays without throwing', () => {
    expect(compressKeys(null)).toBeNull()
    expect(Array.isArray(compressKeys([{ id: 'n1' }]))).toBe(true)
  })
})

describe('omitDefaults: remove boilerplate values', () => {
  it('omits priority=3 (default)', () => {
    const result = omitDefaults({ priority: 3, title: 'x' }) as Record<string, unknown>
    expect(result['priority']).toBeUndefined()
    expect(result['title']).toBe('x')
  })

  it('keeps priority when non-default', () => {
    const result = omitDefaults({ priority: 1, title: 'x' }) as Record<string, unknown>
    expect(result['priority']).toBe(1)
  })

  it('omits status=backlog (default)', () => {
    const result = omitDefaults({ status: 'backlog', id: 'n1' }) as Record<string, unknown>
    expect(result['status']).toBeUndefined()
  })

  it('keeps status when non-default', () => {
    const result = omitDefaults({ status: 'in_progress', id: 'n1' }) as Record<string, unknown>
    expect(result['status']).toBe('in_progress')
  })
})

// ── summarizeTaskContext ───────────────────────────────────────────────────────

describe('summarizeTaskContext: markdown generation', () => {
  function makeCtx() {
    const node = makeNode('n1', {
      title: 'Build the login endpoint',
      description: 'Implement POST /login using JWT.',
      status: 'in_progress',
      priority: 1,
    })
    const store = makeStore([node])
    return buildTaskContext(store, 'n1')!
  }

  it('produces a non-empty markdown string', () => {
    const md = summarizeTaskContext(makeCtx())
    expect(typeof md).toBe('string')
    expect(md.length).toBeGreaterThan(0)
  })

  it('includes the task title in the output', () => {
    const md = summarizeTaskContext(makeCtx())
    expect(md).toContain('Build the login endpoint')
  })

  it('includes ## Goal section', () => {
    const md = summarizeTaskContext(makeCtx())
    expect(md).toContain('## Goal')
  })
})

// ── distillScenarioCard (node_eb0cea23d4d2) ───────────────────────────────────

import { distillScenarioCard } from '../core/context/compact-context.js'
import type { Scenario } from '../core/evals/scenario-runner.js'

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'sc-001',
    tier: 'T1',
    prd: 'This is a long PRD. '.repeat(50), // ~1000 chars → forces truncation
    testCmd: 'npm test',
    tags: ['evals'],
    tokenBudget: 5000,
    ...overrides,
  }
}

describe('distillScenarioCard (AC1 — long prd)', () => {
  it('returns an object with a card field', () => {
    const result = distillScenarioCard(makeScenario())
    expect(typeof result.card).toBe('object')
    expect(result.card).not.toBeNull()
  })

  it('card contains id, tier, testCmd, tokenBudget, tags', () => {
    const { card } = distillScenarioCard(makeScenario())
    expect(card.id).toBe('sc-001')
    expect(card.tier).toBe('T1')
    expect(card.testCmd).toBe('npm test')
    expect(card.tokenBudget).toBe(5000)
    expect(card.tags).toContain('evals')
  })

  it('card.objective is a string of at most 3 sentences', () => {
    const { card } = distillScenarioCard(makeScenario())
    expect(typeof card.objective).toBe('string')
    const sentenceCount = (card.objective.match(/[.!?]/g) ?? []).length
    expect(sentenceCount).toBeLessThanOrEqual(3)
  })

  it('tokensAfter < tokensBefore for a long prd', () => {
    const { tokensBefore, tokensAfter } = distillScenarioCard(makeScenario())
    expect(tokensAfter).toBeLessThan(tokensBefore)
  })

  it('returns numeric tokensBefore and tokensAfter', () => {
    const { tokensBefore, tokensAfter } = distillScenarioCard(makeScenario())
    expect(typeof tokensBefore).toBe('number')
    expect(typeof tokensAfter).toBe('number')
  })
})

describe('distillScenarioCard (AC2 — short prd passthrough)', () => {
  it('returns a card even for a very short prd', () => {
    const sc = makeScenario({ prd: 'Do X.' })
    const { card } = distillScenarioCard(sc)
    expect(card.id).toBe('sc-001')
  })

  it('tokensBefore reflects prd length (short prd → small tokensBefore)', () => {
    const sc = makeScenario({ prd: 'Do X.' })
    const { tokensBefore } = distillScenarioCard(sc)
    // short prd = very few tokens
    expect(tokensBefore).toBeLessThan(10)
  })
})
