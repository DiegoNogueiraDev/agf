/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * Contract for the pinned-invariant pull-in cap (risk node_db3cf9a2e2b1): the
 * real A/B measured flow_on INFLATING context (-105.5%) in a spec-node-rich
 * graph because collectDistantInvariants pulled in every pinned-type node
 * within maxDepth with no ceiling. maxPinnedPullIn caps that pull-in to the
 * top-K by heat-kernel relevance to the focus node — never blunts maxDepth
 * or pinnedTypes (that would cost architecture recall), only the volume.
 */
import { describe, it, expect } from 'vitest'
import { DEFAULT_PINNED_TYPES, buildDecayedTaskContext } from '../core/context/topological-decay.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import type { GraphNode, GraphEdge } from '../core/graph/graph-types.js'

describe('topological-decay', () => {
  it('DEFAULT_PINNED_TYPES includes structural node types', () => {
    expect(DEFAULT_PINNED_TYPES).toContain('constraint')
    expect(DEFAULT_PINNED_TYPES).toContain('risk')
    expect(DEFAULT_PINNED_TYPES).toContain('decision')
    expect(DEFAULT_PINNED_TYPES).toContain('acceptance_criteria')
    expect(DEFAULT_PINNED_TYPES).toContain('constitution')
    expect(DEFAULT_PINNED_TYPES).toContain('requirement')
  })

  it('DEFAULT_PINNED_TYPES has 6 entries', () => {
    expect(DEFAULT_PINNED_TYPES).toHaveLength(6)
  })
})

function isoNow(): string {
  return new Date(0).toISOString()
}

function node(id: string, type: GraphNode['type'], title: string): GraphNode {
  return { id, type, title, status: 'backlog', priority: 3, createdAt: isoNow(), updatedAt: isoNow() }
}

/**
 * A "spec-node-rich" graph: a chain task -> hub, with N constraints hanging
 * off the hub (all at BFS depth 2 from the task) — mirrors the shape that
 * produced the real -105.5% regression.
 */
function seedSpecHeavyGraph(store: SqliteStore, constraintCount: number): void {
  store.initProject('decay-cap-test')
  const nodes: GraphNode[] = [node('task', 'task', 'Focus task'), node('hub', 'task', 'Hub')]
  const edges: GraphEdge[] = [
    { id: 'e_task_hub', from: 'task', to: 'hub', relationType: 'related_to', createdAt: isoNow() },
  ]
  for (let i = 0; i < constraintCount; i += 1) {
    const id = `c${i}`
    nodes.push(node(id, 'constraint', `Constraint ${i}`))
    edges.push({ id: `e_hub_${id}`, from: 'hub', to: id, relationType: 'related_to', createdAt: isoNow() })
  }
  store.bulkInsert(nodes, edges)
}

describe('buildDecayedTaskContext — maxPinnedPullIn caps distant invariant pull-in', () => {
  it('with no cap (Infinity), pulls in every pinned invariant within maxDepth', () => {
    const store = SqliteStore.open(':memory:')
    seedSpecHeavyGraph(store, 20)
    const result = buildDecayedTaskContext(store, 'task', {
      lambda: 0.15,
      maxDepth: 3,
      weightThreshold: 0.1,
      maxPinnedPullIn: Infinity,
    })
    expect(result?.meta.pinnedCount).toBe(20)
    store.close()
  })

  it('caps pull-in to maxPinnedPullIn even when far more pinned nodes exist within maxDepth', () => {
    const store = SqliteStore.open(':memory:')
    seedSpecHeavyGraph(store, 20)
    const result = buildDecayedTaskContext(store, 'task', {
      lambda: 0.15,
      maxDepth: 3,
      weightThreshold: 0.1,
      maxPinnedPullIn: 5,
    })
    expect(result?.meta.pinnedCount).toBe(5)
    store.close()
  })

  it('the cap actually shrinks the shipped token cost vs. the uncapped pull-in', () => {
    const store = SqliteStore.open(':memory:')
    seedSpecHeavyGraph(store, 30)
    const uncapped = buildDecayedTaskContext(store, 'task', {
      lambda: 0.15,
      maxDepth: 3,
      weightThreshold: 0.1,
      maxPinnedPullIn: Infinity,
    })
    const capped = buildDecayedTaskContext(store, 'task', {
      lambda: 0.15,
      maxDepth: 3,
      weightThreshold: 0.1,
      maxPinnedPullIn: 5,
    })
    expect(capped!.meta.tokensActual).toBeLessThan(uncapped!.meta.tokensActual)
    store.close()
  })

  it('under a cap, keeps the invariant with higher heat-kernel relevance (closer/better-connected) over a farther one', () => {
    const store = SqliteStore.open(':memory:')
    store.initProject('decay-cap-relevance-test')
    // Two branches off an intermediate hub, both starting past the 1-hop context:
    // task -> hub -> shallow (depth 2, pinned)
    //             -> mid -> deep (depth 3, pinned) — strictly farther from task.
    const nodes: GraphNode[] = [
      node('task', 'task', 'Focus task'),
      node('hub', 'task', 'Hub'),
      node('shallow', 'constraint', 'Shallow constraint'),
      node('mid', 'task', 'Mid hop'),
      node('deep', 'constraint', 'Deep constraint'),
    ]
    const edges: GraphEdge[] = [
      { id: 'e1', from: 'task', to: 'hub', relationType: 'related_to', createdAt: isoNow() },
      { id: 'e2', from: 'hub', to: 'shallow', relationType: 'related_to', createdAt: isoNow() },
      { id: 'e3', from: 'hub', to: 'mid', relationType: 'related_to', createdAt: isoNow() },
      { id: 'e4', from: 'mid', to: 'deep', relationType: 'related_to', createdAt: isoNow() },
    ]
    store.bulkInsert(nodes, edges)

    const result = buildDecayedTaskContext(store, 'task', {
      lambda: 0.15,
      maxDepth: 3,
      weightThreshold: 0.1,
      maxPinnedPullIn: 1,
    })
    expect(result?.meta.pinnedCount).toBe(1)
    expect(result?.meta.pinnedInvariants.map((p) => p.id)).toEqual(['shallow'])
    store.close()
  })

  it('default config (no maxPinnedPullIn passed) behaves as uncapped — non-regression', () => {
    const store = SqliteStore.open(':memory:')
    seedSpecHeavyGraph(store, 3)
    const result = buildDecayedTaskContext(store, 'task', { lambda: 0.15, maxDepth: 3, weightThreshold: 0.1 })
    expect(result?.meta.pinnedCount).toBe(3)
    store.close()
  })
})
