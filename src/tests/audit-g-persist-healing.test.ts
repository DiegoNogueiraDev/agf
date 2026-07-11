/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Bug-audit regression — AUDIT-053 (HIGH).
 * src/core/skills/persist-healing.ts — `agf heal` (dry-run) must NEVER mutate the
 * graph, even when an immune-memory pattern reaches auto-apply confidence (≥0.9).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { runHealing } from '../core/skills/persist-healing.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

function makeNode(overrides: Partial<GraphNode> & Pick<GraphNode, 'id' | 'title'>): GraphNode {
  const ts = new Date().toISOString()
  return {
    type: 'task',
    status: 'backlog',
    priority: 3,
    acceptanceCriteria: [],
    tags: [],
    createdAt: ts,
    updatedAt: ts,
    metadata: {},
    ...overrides,
  } as GraphNode
}

function makeEdge(o: Pick<GraphEdge, 'id' | 'from' | 'to' | 'relationType'>): GraphEdge {
  return { createdAt: new Date().toISOString(), ...o }
}

describe('AUDIT-053 — heal dry-run never mutates, even at auto-apply confidence', () => {
  let store: SqliteStore

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('audit-053')
    // Cycle A → B → A produces `cycle_detected` issues (fingerprinted for immune memory).
    store.insertNode(makeNode({ id: 'A', title: 'Node A' }))
    store.insertNode(makeNode({ id: 'B', title: 'Node B' }))
    store.insertEdge(makeEdge({ id: 'eAB', from: 'A', to: 'B', relationType: 'depends_on' }))
    store.insertEdge(makeEdge({ id: 'eBA', from: 'B', to: 'A', relationType: 'depends_on' }))
  })

  afterEach(() => {
    store.close()
  })

  it('repeated dry-runs keep applied=0 and leave the graph unmutated', () => {
    // Run enough times that the immune-memory confidence crosses the 0.9 auto-apply line.
    // The bug auto-applied under dry-run once confidence ≥ 0.9 (~4th exposure).
    for (let i = 0; i < 5; i++) {
      const res = runHealing(store, { apply: false })
      expect(res.applied).toBe(0)
    }
    // No cycle node should have been flagged for review by a dry-run.
    expect(store.getNodeById('A')?.metadata?.healingReview).toBeFalsy()
    expect(store.getNodeById('B')?.metadata?.healingReview).toBeFalsy()
  })

  it('apply=true is still allowed to mutate (auto-apply not silently disabled)', () => {
    const res = runHealing(store, { apply: true })
    expect(res.applied).toBeGreaterThan(0)
  })
})
