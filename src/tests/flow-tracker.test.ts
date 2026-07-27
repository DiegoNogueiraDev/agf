/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 1.4 AC coverage: flow-tracker.ts Kanban flow metrics
 *
 * AC1: done tasks contribute to doneCount in snapshot (basis for cycle_time tracking)
 * AC2: snapshot doneCount delta over period reveals throughput
 * AC3: in_progress tasks tracked separately — do not contribute to doneCount (WIP isolation)
 * Coverage: flow-tracker.ts ≥ 90% branch coverage
 */

import { describe, it, expect } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { captureFlowSnapshot, getCfdData } from '../core/insights/flow-tracker.js'
import type { GraphNode, NodeStatus, NodeType } from '../core/graph/graph-types.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

interface FreshContext {
  store: SqliteStore
  projectId: string
}

function freshContext(): FreshContext {
  const store = SqliteStore.open(':memory:')
  const project = store.initProject('flow-test')
  return { store, projectId: project.id }
}

let _seq = 0
function makeNode(override: Partial<GraphNode> = {}): GraphNode {
  const ts = new Date().toISOString()
  return {
    id: `node_flow_${++_seq}`,
    type: 'task' as NodeType,
    title: 'flow task',
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

// ── AC1: done tasks counted in snapshot (basis for cycle_time) ───────────────

describe('AC1: done tasks contribute to doneCount snapshot', () => {
  it('captureFlowSnapshot returns a non-null snapshot', () => {
    const { store, projectId } = freshContext()
    const snap = captureFlowSnapshot(store, projectId)
    expect(snap).not.toBeNull()
    store.close()
  })

  it('snapshot projectId matches the store project', () => {
    const { store, projectId } = freshContext()
    const snap = captureFlowSnapshot(store, projectId)
    expect(snap!.projectId).toBe(projectId)
    store.close()
  })

  it('doneCount reflects the number of done nodes', () => {
    const { store, projectId } = freshContext()
    store.insertNode(makeNode({ status: 'done' }))
    store.insertNode(makeNode({ status: 'done' }))
    store.insertNode(makeNode({ status: 'backlog' }))

    const snap = captureFlowSnapshot(store, projectId)
    expect(snap!.doneCount).toBe(2)
    store.close()
  })

  it('backlogCount reflects backlog nodes', () => {
    const { store, projectId } = freshContext()
    store.insertNode(makeNode({ status: 'backlog' }))
    store.insertNode(makeNode({ status: 'backlog' }))

    const snap = captureFlowSnapshot(store, projectId)
    expect(snap!.backlogCount).toBe(2)
    store.close()
  })

  it('snapshot has a valid snapshotDate in YYYY-MM-DD format', () => {
    const { store, projectId } = freshContext()
    const snap = captureFlowSnapshot(store, projectId)
    expect(snap!.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    store.close()
  })

  it('second captureFlowSnapshot on same day returns same snapshot (idempotent)', () => {
    const { store, projectId } = freshContext()
    const snap1 = captureFlowSnapshot(store, projectId)
    const snap2 = captureFlowSnapshot(store, projectId)
    expect(snap1!.id).toBe(snap2!.id)
    store.close()
  })
})

// ── AC2: throughput via doneCount across snapshots ────────────────────────────

describe('AC2: doneCount delta across snapshots reveals throughput', () => {
  it('getCfdData returns empty array when no snapshots exist', () => {
    const { store, projectId } = freshContext()
    const data = getCfdData(store, projectId)
    expect(data).toEqual([])
    store.close()
  })

  it('getCfdData returns captured snapshots', () => {
    const { store, projectId } = freshContext()
    captureFlowSnapshot(store, projectId)

    const data = getCfdData(store, projectId)
    expect(data.length).toBeGreaterThanOrEqual(1)
    store.close()
  })

  it('getCfdData respects startDate filter (future date → empty)', () => {
    const { store, projectId } = freshContext()
    captureFlowSnapshot(store, projectId)

    const data = getCfdData(store, projectId, { startDate: '2099-01-01' })
    expect(data).toEqual([])
    store.close()
  })

  it('getCfdData respects endDate filter (past date → empty)', () => {
    const { store, projectId } = freshContext()
    captureFlowSnapshot(store, projectId)

    const data = getCfdData(store, projectId, { endDate: '2020-01-01' })
    expect(data).toEqual([])
    store.close()
  })

  it('snapshot contains doneCount equal to the number of done nodes', () => {
    const { store, projectId } = freshContext()
    store.insertNode(makeNode({ status: 'done' }))
    store.insertNode(makeNode({ status: 'done' }))
    store.insertNode(makeNode({ status: 'done' }))
    store.insertNode(makeNode({ status: 'in_progress' }))
    store.insertNode(makeNode({ status: 'backlog' }))

    captureFlowSnapshot(store, projectId)
    const data = getCfdData(store, projectId)
    expect(data[0].doneCount).toBe(3)
    store.close()
  })

  it('doneCount = 2 when 2 tasks are done (baseline for throughput)', () => {
    const { store, projectId } = freshContext()
    store.insertNode(makeNode({ status: 'done' }))
    store.insertNode(makeNode({ status: 'done' }))

    const snap = captureFlowSnapshot(store, projectId)
    expect(snap!.doneCount).toBe(2)
    store.close()
  })
})

// ── AC3: in_progress tracked separately — not in doneCount ───────────────────

describe('AC3: in_progress tracked separately — does not contribute to doneCount', () => {
  it('inProgressCount reflects in_progress nodes', () => {
    const { store, projectId } = freshContext()
    store.insertNode(makeNode({ status: 'in_progress' }))
    store.insertNode(makeNode({ status: 'done' }))

    const snap = captureFlowSnapshot(store, projectId)
    expect(snap!.inProgressCount).toBe(1)
    expect(snap!.doneCount).toBe(1)
    store.close()
  })

  it('in_progress nodes do NOT contribute to doneCount', () => {
    const { store, projectId } = freshContext()
    store.insertNode(makeNode({ status: 'in_progress' }))
    store.insertNode(makeNode({ status: 'in_progress' }))

    const snap = captureFlowSnapshot(store, projectId)
    expect(snap!.doneCount).toBe(0)
    expect(snap!.inProgressCount).toBe(2)
    store.close()
  })

  it('WIP (inProgressCount) and done count are independent', () => {
    const { store, projectId } = freshContext()
    store.insertNode(makeNode({ status: 'in_progress' }))
    store.insertNode(makeNode({ status: 'done' }))
    store.insertNode(makeNode({ status: 'done' }))
    store.insertNode(makeNode({ status: 'done' }))

    const snap = captureFlowSnapshot(store, projectId)
    expect(snap!.inProgressCount).toBe(1)
    expect(snap!.doneCount).toBe(3)
    store.close()
  })
})

// ── Sprint filtering + additional branch coverage ─────────────────────────────

describe('sprint filtering coverage', () => {
  it('captureFlowSnapshot with sprint stores sprint value', () => {
    const { store, projectId } = freshContext()
    const snap = captureFlowSnapshot(store, projectId, 'sprint-1')
    expect(snap).not.toBeNull()
    expect(snap!.sprint).toBe('sprint-1')
    store.close()
  })

  it('captureFlowSnapshot without sprint has null sprint field', () => {
    const { store, projectId } = freshContext()
    const snap = captureFlowSnapshot(store, projectId)
    expect(snap!.sprint).toBeNull()
    store.close()
  })

  it('getCfdData sprint filter excludes non-matching sprint', () => {
    const { store, projectId } = freshContext()
    captureFlowSnapshot(store, projectId, 'sprint-1')

    const data = getCfdData(store, projectId, { sprint: 'sprint-x' })
    expect(data).toEqual([])
    store.close()
  })

  it('getCfdData without sprint returns all snapshots', () => {
    const { store, projectId } = freshContext()
    captureFlowSnapshot(store, projectId)

    const data = getCfdData(store, projectId)
    expect(data.length).toBeGreaterThan(0)
    store.close()
  })

  it('blockedCount is tracked in snapshot', () => {
    const { store, projectId } = freshContext()
    store.insertNode(makeNode({ status: 'blocked' }))
    store.insertNode(makeNode({ status: 'blocked' }))

    const snap = captureFlowSnapshot(store, projectId)
    expect(snap!.blockedCount).toBe(2)
    store.close()
  })

  it('sprint idempotency — second captureFlowSnapshot with same sprint returns same snapshot', () => {
    const { store, projectId } = freshContext()
    const s1 = captureFlowSnapshot(store, projectId, 'sprint-2')
    const s2 = captureFlowSnapshot(store, projectId, 'sprint-2')
    expect(s1!.id).toBe(s2!.id)
    store.close()
  })
})
