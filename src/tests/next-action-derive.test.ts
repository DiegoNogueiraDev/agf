/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2026 Diego Lima Nogueira de Paula
 *
 * Onda 1B — the context-pack carries a deterministic `nextAction` block
 * (ready / blockedBy / reason / suggestedCommand) derived from data the
 * neighbourhood already loaded (blockers, dependsOn.resolved, status). It
 * lets an agent know what to do next without a follow-up check/next call.
 * Pure derivation — zero extra query, additive (default behaviour intact).
 */

import { describe, it, expect } from 'vitest'
import type { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'
import { buildTaskContext, buildCompressedContext, deriveNextAction } from '../core/context/compact-context.js'

// ── Store shim (mirrors compact-context.test.ts) ──────────────────────────────

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

function ctxFor(nodes: GraphNode[], edges: GraphEdge[], id: string) {
  const ctx = buildTaskContext(makeStore(nodes, edges), id)
  if (!ctx) throw new Error('context build returned null')
  return ctx
}

// ── Derivation ────────────────────────────────────────────────────────────────

describe('deriveNextAction', () => {
  it('is not ready when a dependency is unresolved, listing it in blockedBy', () => {
    const nodes = [makeNode('t'), makeNode('dep', { status: 'in_progress' })]
    const ctx = ctxFor(nodes, [makeEdge('t', 'dep', 'depends_on')], 't')
    const na = deriveNextAction(ctx)
    expect(na.ready).toBe(false)
    expect(na.blockedBy).toContain('dep')
  })

  it('is not ready when an open blocker exists', () => {
    const nodes = [makeNode('t'), makeNode('blk', { status: 'in_progress' })]
    const ctx = ctxFor(nodes, [makeEdge('blk', 't', 'blocks')], 't')
    const na = deriveNextAction(ctx)
    expect(na.ready).toBe(false)
    expect(na.blockedBy).toContain('blk')
  })

  it('is ready and suggests `agf start` for an unblocked backlog task', () => {
    const nodes = [makeNode('t', { status: 'backlog' }), makeNode('dep', { status: 'done' })]
    const ctx = ctxFor(nodes, [makeEdge('t', 'dep', 'depends_on')], 't')
    const na = deriveNextAction(ctx)
    expect(na.ready).toBe(true)
    expect(na.blockedBy).toHaveLength(0)
    expect(na.suggestedCommand).toContain('agf start')
  })

  it('suggests `agf check` for an in-progress task', () => {
    const ctx = ctxFor([makeNode('t', { status: 'in_progress' })], [], 't')
    const na = deriveNextAction(ctx)
    expect(na.ready).toBe(true)
    expect(na.suggestedCommand).toContain('agf check')
  })
})

// ── Integration: attached + survives compression ─────────────────────────────

describe('nextAction in the context-pack', () => {
  it('is attached to buildTaskContext output', () => {
    const ctx = ctxFor([makeNode('t', { status: 'in_progress' })], [], 't')
    expect(ctx.nextAction).toBeDefined()
    expect(ctx.nextAction?.ready).toBe(true)
  })

  it('survives buildCompressedContext under its short key `na`', () => {
    const compressed = buildCompressedContext(makeStore([makeNode('t', { status: 'in_progress' })]), 't')
    expect(compressed).not.toBeNull()
    expect(compressed?.payload.na).toBeDefined()
  })
})
