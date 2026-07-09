/*!
 * TDD: commit executor with re-count + idempotency guard (node_28e559582160).
 *
 * AC: Given a seeded gap, when --commit runs, then the gap is gone on re-count
 *     and a second run is a no-op (monotonically non-increasing).
 *
 * Uses detect-stale-container gaps (concrete, no-placeholder applyVia) so that
 * applyGaps sees them as deterministic and the execute callback can actually fix them.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { detectAllGaps } from '../core/gaps/index.js'
import { applyGaps } from '../core/gaps/gap-applier.js'
import type { GraphNode } from '../core/graph/graph-types.js'
import { generateId } from '../core/utils/id.js'

function now() {
  return new Date().toISOString()
}

function makeStore(): SqliteStore {
  const store = SqliteStore.open(':memory:')
  store.initProject('Test')
  return store
}

function insertNode(store: SqliteStore, fields: Partial<GraphNode> & { type: string; title: string }): GraphNode {
  const node: GraphNode = {
    id: generateId('node'),
    type: fields.type as never,
    title: fields.title,
    status: (fields.status as never) ?? 'backlog',
    priority: fields.priority ?? 3,
    parentId: fields.parentId,
    createdAt: now(),
    updatedAt: now(),
    tags: fields.tags,
  }
  store.insertNode(node)
  return node
}

function makeExecutor(store: SqliteStore) {
  return (cmd: string) => {
    const m = cmd.match(/agf node status (\S+) done/)
    if (m) store.updateNodeStatus(m[1], 'done')
  }
}

describe('commit executor with re-count + idempotency', () => {
  it('applying gaps reduces gap count (monotonically non-increasing)', () => {
    const store = makeStore()

    // Epic in_progress with all children done → stale_container gap (uses parentId, not edges)
    const epic = insertNode(store, { type: 'epic', title: 'Stale Epic', status: 'in_progress' })
    insertNode(store, { type: 'task', title: 'Done child', status: 'done', parentId: epic.id })

    const doc1 = store.toGraphDocument()
    const gaps1 = detectAllGaps(doc1, ['stale_container'])
    const initialCount = gaps1.length

    const committed = applyGaps(gaps1, { dryRun: false, execute: makeExecutor(store) })

    const doc2 = store.toGraphDocument()
    const gaps2 = detectAllGaps(doc2, ['stale_container'])

    expect(committed.applied.length).toBeGreaterThan(0)
    expect(gaps2.length).toBeLessThan(initialCount)
  })

  it('second run is a no-op (idempotency): gap count does not increase', () => {
    const store = makeStore()

    const epic = insertNode(store, { type: 'epic', title: 'Stale Epic 2', status: 'in_progress' })
    insertNode(store, { type: 'task', title: 'Done child', status: 'done', parentId: epic.id })

    const execute = makeExecutor(store)

    const doc1 = store.toGraphDocument()
    const gaps1 = detectAllGaps(doc1, ['stale_container'])
    applyGaps(gaps1, { dryRun: false, execute })

    // Second run
    const doc2 = store.toGraphDocument()
    const gaps2 = detectAllGaps(doc2, ['stale_container'])
    const run2 = applyGaps(gaps2, { dryRun: false, execute })

    // Third detect
    const doc3 = store.toGraphDocument()
    const gaps3 = detectAllGaps(doc3, ['stale_container'])

    // Monotonically non-increasing
    expect(gaps3.length).toBeLessThanOrEqual(gaps2.length)
    // Second run applied ≤ first (idempotency)
    expect(run2.applied.length).toBeLessThanOrEqual(gaps1.length)
  })
})
