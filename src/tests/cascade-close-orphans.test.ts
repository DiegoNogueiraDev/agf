/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * TDD: node_0fa076c8d97d — cascade-close orphan children when parent epic
 * closes. The bug: backlog children whose work was already implemented
 * under a parent node closed earlier were only discovered via manual
 * preflight/grep. findPotentiallySatisfiedChildren computes cosine
 * similarity (reusing ac-testability.ts's tokenize/cosineSimilarity — same
 * technique scoreAcTestabilityBatch already uses for redundancy detection)
 * between a child's AC and its just-closed parent's AC/declared files, and
 * flags high-overlap children as "potentially satisfied" — a WARNING, never
 * an auto-close (the human verifies and closes manually).
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { findPotentiallySatisfiedChildren } from '../core/utils/cascade-close-orphans.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('cascade-close-test')
  return store
}

function addNode(store: SqliteStore, overrides: Partial<GraphNode> & { id: string }): void {
  const now = new Date().toISOString()
  store.insertNode({
    type: 'task',
    title: overrides.id,
    status: 'backlog',
    priority: 2,
    acceptanceCriteria: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as GraphNode)
}

describe('findPotentiallySatisfiedChildren', () => {
  it("GIVEN child's AC is satisfied by parent's declared files/AC THEN it is flagged as potentially satisfied", () => {
    const store = makeStore()
    addNode(store, {
      id: 'node_A',
      status: 'done',
      testFiles: ['src/tests/pricing.test.ts'],
      implementationFiles: ['src/core/pricing.ts'],
      acceptanceCriteria: [
        'Given 1M inputTokens and outputPerMtok=30, calcCost returns totalUsd correctly for the pricing formula',
      ],
    })
    addNode(store, {
      id: 'node_B',
      parentId: 'node_A',
      acceptanceCriteria: [
        'Given inputTokens and outputPerMtok, calcCost returns totalUsd correctly for the pricing formula',
      ],
    })

    const result = findPotentiallySatisfiedChildren(store, 'node_A')
    expect(result).toHaveLength(1)
    expect(result[0].nodeId).toBe('node_B')
  })

  it("GIVEN child's AC is unrelated to the parent THEN no suggestion is made for it", () => {
    const store = makeStore()
    addNode(store, {
      id: 'node_A',
      status: 'done',
      testFiles: ['src/tests/pricing.test.ts'],
      acceptanceCriteria: ['calcCost returns totalUsd for the token pricing formula'],
    })
    addNode(store, {
      id: 'node_B',
      parentId: 'node_A',
      acceptanceCriteria: ['The TUI dashboard renders a bar chart of colony health snapshots'],
    })

    const result = findPotentiallySatisfiedChildren(store, 'node_A')
    expect(result).toHaveLength(0)
  })

  it('GIVEN 3 children — 2 similar + 1 unrelated — THEN exactly 2 are flagged', () => {
    const store = makeStore()
    addNode(store, {
      id: 'node_A',
      status: 'done',
      testFiles: ['src/tests/pricing.test.ts'],
      acceptanceCriteria: ['calcCost returns totalUsd for the token pricing formula given inputPerMtok'],
    })
    addNode(store, {
      id: 'node_B1',
      parentId: 'node_A',
      acceptanceCriteria: ['calcCost returns totalUsd given inputPerMtok for the pricing formula'],
    })
    addNode(store, {
      id: 'node_B2',
      parentId: 'node_A',
      acceptanceCriteria: ['calcCost returns the totalUsd for the pricing formula and inputPerMtok'],
    })
    addNode(store, {
      id: 'node_B3',
      parentId: 'node_A',
      acceptanceCriteria: ['The colony caste taxonomy lists max_complexity per caste'],
    })

    const result = findPotentiallySatisfiedChildren(store, 'node_A')
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.nodeId).sort()).toEqual(['node_B1', 'node_B2'])
  })

  it('GIVEN the parent has NO declared files/AC THEN returns [] (nothing to compare against)', () => {
    const store = makeStore()
    addNode(store, { id: 'node_A', status: 'done' })
    addNode(store, { id: 'node_B', parentId: 'node_A', acceptanceCriteria: ['some AC'] })

    expect(findPotentiallySatisfiedChildren(store, 'node_A')).toEqual([])
  })

  it('GIVEN a done child THEN it is excluded (already closed, nothing to warn about)', () => {
    const store = makeStore()
    addNode(store, {
      id: 'node_A',
      status: 'done',
      acceptanceCriteria: ['calcCost returns totalUsd for the token pricing formula'],
    })
    addNode(store, {
      id: 'node_B',
      parentId: 'node_A',
      status: 'done',
      acceptanceCriteria: ['calcCost returns totalUsd for the token pricing formula'],
    })

    expect(findPotentiallySatisfiedChildren(store, 'node_A')).toEqual([])
  })
})
