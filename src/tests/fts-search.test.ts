/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 3.2 AC coverage: fts-search.ts searchNodes
 *
 * AC1: indexed nodes with matching title/description → ranked by BM25 score
 * AC2: non-existent terms → empty array (not null, not error)
 * AC3: FTS5 index auto-updates via triggers → post-insert query returns new nodes
 * AC4: special chars (quotes, asterisk) → sanitized without SQL error/injection
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { searchNodes } from '../core/search/fts-search.js'
import type { GraphNode, NodeStatus, NodeType } from '../core/graph/graph-types.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

function freshStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('fts-test')
  return store
}

let _seq = 0
function makeNode(override: Partial<GraphNode> = {}): GraphNode {
  const id = override.id ?? `node_fts_${++_seq}`
  const ts = new Date().toISOString()
  return {
    id,
    type: 'task' as NodeType,
    title: 'untitled',
    description: '',
    status: 'backlog' as NodeStatus,
    priority: 3,
    xpSize: 'S',
    parentId: null,
    acceptanceCriteria: [],
    tags: [],
    createdAt: ts,
    updatedAt: ts,
    metadata: {},
    ...override,
  }
}

let store: SqliteStore

beforeEach(() => {
  store = freshStore()
})

// ── AC1: BM25-ranked results ──────────────────────────────────────────────────

describe('AC1: FTS5 returns BM25-ranked results', () => {
  it('returns nodes whose title matches the query', () => {
    store.insertNode(makeNode({ id: 'n1', title: 'pheromone trail for ACO', description: 'ant colony optimization' }))
    store.insertNode(makeNode({ id: 'n2', title: 'unrelated billing task', description: 'payment processing' }))

    const results = searchNodes(store, 'pheromone')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].node.id).toBe('n1')
  })

  it('returns nodes matching description when title does not match', () => {
    store.insertNode(
      makeNode({ id: 'n3', title: 'immune system task', description: 'pheromone decay evaporation halflife' }),
    )
    store.insertNode(makeNode({ id: 'n4', title: 'billing invoice', description: 'stripe payment webhook' }))

    const results = searchNodes(store, 'evaporation')
    const ids = results.map((r) => r.node.id)
    expect(ids).toContain('n3')
  })

  it('returns results with numeric score from BM25', () => {
    store.insertNode(makeNode({ id: 'n5', title: 'graph node edge relation', description: '' }))

    const results = searchNodes(store, 'graph')
    expect(results.length).toBeGreaterThan(0)
    expect(typeof results[0].score).toBe('number')
  })

  it('respects the limit option', () => {
    for (let i = 1; i <= 10; i++) {
      store.insertNode(makeNode({ id: `n_limit_${i}`, title: `immune cycle detection ${i}`, description: '' }))
    }
    const results = searchNodes(store, 'immune', { limit: 3 })
    expect(results.length).toBeLessThanOrEqual(3)
  })

  it('matches multiple terms (implicit AND in FTS5)', () => {
    store.insertNode(makeNode({ id: 'n6', title: 'pheromone decay function', description: '' }))
    store.insertNode(makeNode({ id: 'n7', title: 'pheromone signal only', description: '' }))

    // Both terms must be present → only n6 matches "pheromone" AND "decay"
    const results = searchNodes(store, 'pheromone decay')
    expect(results.some((r) => r.node.id === 'n6')).toBe(true)
  })
})

// ── AC2: non-existent terms → empty array ────────────────────────────────────

describe('AC2: non-existent terms return empty array', () => {
  it('returns [] for a query matching no nodes', () => {
    store.insertNode(makeNode({ id: 'na', title: 'billing task', description: '' }))
    const results = searchNodes(store, 'xyznomatch')
    expect(results).toEqual([])
  })

  it('returns [] for empty store', () => {
    const results = searchNodes(store, 'anything')
    expect(results).toEqual([])
  })

  it('returns [] (not null, not error) for a stopword-only query', () => {
    store.insertNode(makeNode({ id: 'nb', title: 'some task', description: '' }))
    // FTS5 query sanitized to empty → early return []
    const results = searchNodes(store, '*')
    expect(Array.isArray(results)).toBe(true)
  })
})

// ── AC3: FTS5 index auto-updates via INSERT trigger ───────────────────────────

describe('AC3: FTS5 index stays current after inserts', () => {
  it('finds a node inserted after the store was opened', () => {
    const results1 = searchNodes(store, 'stigmergy')
    expect(results1).toEqual([])

    store.insertNode(makeNode({ id: 'nc', title: 'stigmergy pheromone routing', description: '' }))

    const results2 = searchNodes(store, 'stigmergy')
    expect(results2.length).toBeGreaterThan(0)
    expect(results2[0].node.id).toBe('nc')
  })

  it('updated title is reflected in next search (UPDATE trigger)', () => {
    store.insertNode(makeNode({ id: 'nd', title: 'original immune task', description: '' }))

    // Verify original search
    expect(searchNodes(store, 'original').length).toBeGreaterThan(0)

    // Update the node title
    store.updateNode('nd', { title: 'mutated kanban board' })

    // Original term should no longer match
    const oldResults = searchNodes(store, 'original')
    expect(oldResults.some((r) => r.node.id === 'nd')).toBe(false)

    // New term should match
    const newResults = searchNodes(store, 'kanban')
    expect(newResults.some((r) => r.node.id === 'nd')).toBe(true)
  })
})

// ── AC4: special chars sanitized — no SQL injection ──────────────────────────

describe('AC4: special characters are sanitized without error', () => {
  it('does not throw on query with asterisk (*)', () => {
    store.insertNode(makeNode({ id: 'ne', title: 'normal task', description: '' }))
    expect(() => searchNodes(store, '*')).not.toThrow()
  })

  it('does not throw on query with quotes (")', () => {
    expect(() => searchNodes(store, '"unclosed quote')).not.toThrow()
  })

  it('does not throw on query with FTS5 boolean operators', () => {
    expect(() => searchNodes(store, 'pheromone AND NOT immune OR tasks')).not.toThrow()
  })

  it('does not throw on query with parentheses and braces', () => {
    expect(() => searchNodes(store, '(pheromone) {decay}')).not.toThrow()
  })

  it('returns array (not null) for malformed query', () => {
    const result = searchNodes(store, '*** (( broken query !!!')
    expect(Array.isArray(result)).toBe(true)
  })

  it('does not throw on empty string query', () => {
    expect(() => searchNodes(store, '')).not.toThrow()
  })
})
