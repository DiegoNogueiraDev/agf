/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * node_aff3a524791d — harness ≥70 gate on epic promotion (Item 5 do mapa TTM).
 * checkEpicHarnessGate is pure (the 3 AC map directly to it); readLastHarnessScore
 * reuses the harness_history read (no re-scan); the wire is proven end-to-end via
 * RealTaskLifecycleService.finishTask, asserting the task's own done is NOT reverted.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { RealTaskLifecycleService } from '../core/services/task-lifecycle.js'
import {
  checkEpicHarnessGate,
  readLastHarnessScore,
  HARNESS_PROMOTION_THRESHOLD,
} from '../core/utils/epic-promotion-gate.js'
import type { GraphNode } from '../core/graph/graph-types.js'

describe('checkEpicHarnessGate — pure harness threshold (node_aff3a524791d)', () => {
  it('blocks promotion with HARNESS_BELOW_PROMOTION when the last score is below 70', () => {
    const gate = checkEpicHarnessGate(65)
    expect(gate.blocked).toBe(true)
    expect(gate.code).toBe('HARNESS_BELOW_PROMOTION')
    expect(gate.score).toBe(65)
  })

  it('allows promotion (no code) when the last score is at/above 70 — zero regression', () => {
    expect(checkEpicHarnessGate(85).blocked).toBe(false)
    expect(checkEpicHarnessGate(85).code).toBeUndefined()
    expect(checkEpicHarnessGate(HARNESS_PROMOTION_THRESHOLD).blocked).toBe(false)
  })

  it('warns with HARNESS_UNKNOWN (never blocks) on cold start — no history', () => {
    const gate = checkEpicHarnessGate(null)
    expect(gate.blocked).toBe(false)
    expect(gate.code).toBe('HARNESS_UNKNOWN')
  })
})

function seedHarnessScore(store: SqliteStore, score: number, ts: number = Date.now()): void {
  store
    .getDb()
    .prepare(
      `INSERT INTO harness_history (id, project_id, score, grade, breakdown, git_commit, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(`h_${score}_${ts}`, 'p', score, 'B', '{}', 'abc', ts)
}

describe('readLastHarnessScore — reuses harness_history read (no re-scan)', () => {
  it('returns the most recent score', () => {
    const store = SqliteStore.open(':memory:')
    store.initProject('harness-read')
    seedHarnessScore(store, 55, 1000)
    seedHarnessScore(store, 88, 2000)
    const score = readLastHarnessScore(store.getDb())
    store.close()
    expect(score).toBe(88)
  })

  it('returns null when harness_history is empty (cold start)', () => {
    const store = SqliteStore.open(':memory:')
    store.initProject('harness-empty')
    const score = readLastHarnessScore(store.getDb())
    store.close()
    expect(score).toBeNull()
  })
})

function seedDoneableChild(store: SqliteStore, epicId: string, childId: string): void {
  const now = new Date().toISOString()
  store.insertNode({
    id: epicId,
    type: 'epic',
    title: 'Epic',
    status: 'backlog',
    priority: 3,
    acceptanceCriteria: [],
    tags: [],
    createdAt: now,
    updatedAt: now,
    metadata: {},
  } as GraphNode)
  store.insertNode({
    id: childId,
    type: 'task',
    title: 'Child task',
    description: 'a child task',
    status: 'in_progress', // status_flow_valid: já passou por in_progress
    priority: 3,
    xpSize: 'S',
    parentId: epicId,
    acceptanceCriteria: [
      'Given a valid input, When the function runs, Then it returns the expected output',
      'Given an invalid input, When the function runs, Then it throws a typed error',
    ],
    tags: [],
    createdAt: now,
    updatedAt: now,
    metadata: {},
  } as GraphNode)
}

describe('epic-promotion harness gate — wired into finishTask (consumer proof)', () => {
  let store: SqliteStore
  let service: RealTaskLifecycleService

  beforeEach(() => {
    store = SqliteStore.open(':memory:')
    store.initProject('epic-harness')
    service = new RealTaskLifecycleService(store)
  })
  afterEach(() => store.close())

  it('AC1: score 65 refuses promotion (HARNESS_BELOW_PROMOTION) but does NOT revert the task done', () => {
    seedDoneableChild(store, 'epic1', 'child1')
    seedHarnessScore(store, 65)
    const report = service.finishTask('child1')
    expect(report.ready).toBe(true)
    expect(report.epicPromotion?.blocked).toBe(true)
    expect(report.epicPromotion?.harnessCode).toBe('HARNESS_BELOW_PROMOTION')
    // the task's own done is not reverted by the epic gate
    expect(store.getNodeById('child1')?.status).toBe('done')
  })

  it('AC2: score 85 promotes normally (not blocked by harness)', () => {
    seedDoneableChild(store, 'epic2', 'child2')
    seedHarnessScore(store, 85)
    const report = service.finishTask('child2')
    expect(report.ready).toBe(true)
    expect(report.epicPromotion?.blocked).toBe(false)
    expect(report.epicPromotion?.harnessCode).toBeUndefined()
  })

  it('AC3: no harness_history warns HARNESS_UNKNOWN instead of blocking (cold start)', () => {
    seedDoneableChild(store, 'epic3', 'child3')
    const report = service.finishTask('child3')
    expect(report.ready).toBe(true)
    expect(report.epicPromotion?.blocked).toBe(false)
    expect(report.epicPromotion?.harnessCode).toBe('HARNESS_UNKNOWN')
  })
})
