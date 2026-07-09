/*!
 * TDD: agf migrate-ac — collapse AC-nodes into task.ac[] + soft-archive (node_295b2461a757).
 *
 * AC1: AC-node child of task → title goes into task.ac[], AC-node gets archived=1.
 * AC2: total criteria count (field + nodes) preserved before/after.
 * AC3: idempotent — running 2× doesn't duplicate ac[] or re-archive.
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { generateId } from '../core/utils/id.js'
import { migrateAcNodes, type MigrateAcResult } from '../core/importer/migrate-ac.js'
import type { GraphNode } from '../core/graph/graph-types.js'

function now(): string {
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
    acceptanceCriteria: fields.acceptanceCriteria,
    createdAt: now(),
    updatedAt: now(),
  }
  store.insertNode(node)
  return node
}

describe('AC1: AC-node folded into parent.ac[] and archived', () => {
  it('appends AC-node title to parent task.acceptanceCriteria', () => {
    const store = makeStore()
    const task = insertNode(store, { type: 'task', title: 'My Task' })
    insertNode(store, { type: 'acceptance_criteria', title: 'Given X When Y Then Z', parentId: task.id })

    const result: MigrateAcResult = migrateAcNodes(store, { commit: true })

    const updated = store.getNodeById(task.id)!
    expect(updated.acceptanceCriteria ?? []).toContain('Given X When Y Then Z')
    expect(result.migrated).toBe(1)
  })

  it('archives the AC-node (soft-deletes it)', () => {
    const store = makeStore()
    const task = insertNode(store, { type: 'task', title: 'My Task' })
    const acNode = insertNode(store, {
      type: 'acceptance_criteria',
      title: 'Given A When B Then C',
      parentId: task.id,
    })

    migrateAcNodes(store, { commit: true })

    const archived = store.getNodeById(acNode.id)
    // After archive, the node should be gone from active nodes
    expect(archived).toBeNull()
  })
})

describe('AC2: total criteria count preserved', () => {
  it('reports matching beforeCount and afterCount', () => {
    const store = makeStore()
    const task = insertNode(store, { type: 'task', title: 'Task', acceptanceCriteria: ['Existing AC'] })
    insertNode(store, { type: 'acceptance_criteria', title: 'New AC', parentId: task.id })

    const result = migrateAcNodes(store, { commit: true })

    // Before: 1 in field + 1 node = 2; after: 2 in field = 2
    expect(result.beforeCount).toBe(2)
    expect(result.afterCount).toBe(2)
  })
})

describe('AC3: idempotent', () => {
  it('running twice does not duplicate ac[] entries', () => {
    const store = makeStore()
    const task = insertNode(store, { type: 'task', title: 'Task' })
    insertNode(store, { type: 'acceptance_criteria', title: 'Criterion A', parentId: task.id })

    migrateAcNodes(store, { commit: true })
    migrateAcNodes(store, { commit: true }) // second run

    const updated = store.getNodeById(task.id)!
    const ac = updated.acceptanceCriteria ?? []
    const unique = new Set(ac)
    expect(unique.size).toBe(ac.length) // no duplicates
    expect(ac.filter((s) => s === 'Criterion A').length).toBe(1)
  })

  it('dry-run (default) does not mutate', () => {
    const store = makeStore()
    const task = insertNode(store, { type: 'task', title: 'Task' })
    insertNode(store, { type: 'acceptance_criteria', title: 'Criterion', parentId: task.id })

    const result = migrateAcNodes(store, { commit: false })

    const unchanged = store.getNodeById(task.id)!
    expect(unchanged.acceptanceCriteria ?? []).toHaveLength(0)
    expect(result.migrated).toBe(0) // dry-run reports 0 committed
    expect(result.wouldMigrate).toBe(1) // but reports what would migrate
  })
})

describe('AC-node special cases (node_43141bb337e2)', () => {
  it('AC with epic parent → folded into epic.ac[]', () => {
    const store = makeStore()
    const epic = insertNode(store, { type: 'epic', title: 'My Epic' })
    insertNode(store, { type: 'acceptance_criteria', title: 'Epic AC criterion', parentId: epic.id })

    const result = migrateAcNodes(store, { commit: true })

    const updated = store.getNodeById(epic.id)!
    expect(updated.acceptanceCriteria ?? []).toContain('Epic AC criterion')
    expect(result.migrated).toBeGreaterThan(0)
  })

  it('AC with risk parent → reported as malformed, archived', () => {
    const store = makeStore()
    const risk = insertNode(store, { type: 'risk', title: 'Some Risk' })
    const acNode = insertNode(store, { type: 'acceptance_criteria', title: 'Orphan AC', parentId: risk.id })

    const result = migrateAcNodes(store, { commit: true })

    expect(result.malformed).toBeGreaterThan(0)
    // AC node should be archived (soft-deleted)
    expect(store.getNodeById(acNode.id)).toBeNull()
  })

  it('AC child of another AC (nested) → malformed, archived', () => {
    const store = makeStore()
    const task = insertNode(store, { type: 'task', title: 'Task' })
    const parentAc = insertNode(store, { type: 'acceptance_criteria', title: 'Parent AC', parentId: task.id })
    const childAc = insertNode(store, {
      type: 'acceptance_criteria',
      title: 'Nested AC',
      parentId: parentAc.id,
    })

    const result = migrateAcNodes(store, { commit: true })

    expect(result.malformed).toBeGreaterThan(0)
    expect(store.getNodeById(childAc.id)).toBeNull()
  })

  it('orphan AC (no parent) → malformed, archived', () => {
    const store = makeStore()
    const acNode = insertNode(store, { type: 'acceptance_criteria', title: 'Orphan', parentId: undefined })

    const result = migrateAcNodes(store, { commit: true })

    expect(result.malformed).toBeGreaterThan(0)
    expect(store.getNodeById(acNode.id)).toBeNull()
  })
})

describe('node_c62b82bf5b37: malformed nodes are reported by id+title+reason, not just a count', () => {
  it('malformedDetails includes the archived node id, title, and a human-readable reason', () => {
    const store = makeStore()
    const acNode = insertNode(store, {
      type: 'acceptance_criteria',
      title: 'Orphan criterion text',
      parentId: undefined,
    })

    const result = migrateAcNodes(store, { commit: true })

    expect(result.malformedDetails).toHaveLength(1)
    expect(result.malformedDetails[0]).toEqual({
      id: acNode.id,
      title: 'Orphan criterion text',
      reason: 'orphan',
    })
  })

  it('reports the correct reason for each malformed category (dangling ref, unsupported parent type, nested AC)', () => {
    const store = makeStore()
    const risk = insertNode(store, { type: 'risk', title: 'Some Risk' })
    const wrongParent = insertNode(store, {
      type: 'acceptance_criteria',
      title: 'Wrong parent type',
      parentId: risk.id,
    })
    const dangling = insertNode(store, {
      type: 'acceptance_criteria',
      title: 'Dangling ref',
      parentId: 'node_does_not_exist',
    })
    const task = insertNode(store, { type: 'task', title: 'Task' })
    const parentAc = insertNode(store, { type: 'acceptance_criteria', title: 'Parent AC', parentId: task.id })
    const nested = insertNode(store, { type: 'acceptance_criteria', title: 'Nested AC', parentId: parentAc.id })

    const result = migrateAcNodes(store, { commit: true })

    const byId = new Map(result.malformedDetails.map((d) => [d.id, d]))
    expect(byId.get(wrongParent.id)?.reason).toBe('unsupported_parent_type')
    expect(byId.get(dangling.id)?.reason).toBe('dangling_ref')
    expect(byId.get(nested.id)?.reason).toBe('nested_ac')
  })

  it('dry-run also reports malformedDetails, without mutating anything', () => {
    const store = makeStore()
    const acNode = insertNode(store, { type: 'acceptance_criteria', title: 'Orphan', parentId: undefined })

    const result = migrateAcNodes(store, { commit: false })

    expect(result.malformedDetails).toHaveLength(1)
    expect(result.malformedDetails[0].id).toBe(acNode.id)
    expect(store.getNodeById(acNode.id)).not.toBeNull() // dry-run never mutates
  })
})
