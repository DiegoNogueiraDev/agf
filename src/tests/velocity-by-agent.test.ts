/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import { SqliteStore } from '../core/store/sqlite-store.js'
import { recordModelCall } from '../core/observability/llm-call-ledger.js'
import { computeVelocityScorecard, collectVelocityScorecard } from '../core/evals/scorecard.js'

function freshStore(): SqliteStore {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  const store = new SqliteStore(db)
  store.initProject('proj-byagent')
  return store
}

function seedTask(
  store: SqliteStore,
  overrides: {
    id: string
    claimedBy?: string
    status?: string
    createdAt?: string
    updatedAt?: string
  },
): void {
  store.insertNode({
    id: overrides.id,
    type: 'task',
    title: `task ${overrides.id}`,
    description: 'byAgent fixture',
    priority: 1,
    status: (overrides.status ?? 'done') as
      'done' | 'in_progress' | 'ready' | 'blocked' | 'backlog' | 'cancelled' | 'waiting',
    acceptanceCriteria: ['ac1'],
    tags: [],
    createdAt: overrides.createdAt ?? new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    metadata: overrides.claimedBy ? { claimedBy: overrides.claimedBy } : {},
  })
}

function seedLedger(db: Database.Database, nodeId: string, tokens: number): void {
  recordModelCall(db, {
    sessionId: 'test-session',
    nodeId,
    provider: 'test',
    model: 'test-model',
    inputTokens: tokens,
    outputTokens: 0,
  })
}

// ── AC1: 3 done formiga-a + 1 done formiga-b → byAgent 2 entries ───────────

describe('AC1: multiple agents with claimedBy', () => {
  it('produces byAgent entries for each distinct agent', () => {
    const store = freshStore()

    seedTask(store, { id: 't1', claimedBy: 'formiga-a' })
    seedTask(store, { id: 't2', claimedBy: 'formiga-a' })
    seedTask(store, { id: 't3', claimedBy: 'formiga-a' })
    seedTask(store, { id: 't4', claimedBy: 'formiga-b' })

    const sc = collectVelocityScorecard(store)

    expect(sc.byAgent).toHaveLength(2)
    expect(sc.byAgent[0].agent).toBe('formiga-a')
    expect(sc.byAgent[0].doneTasks).toBe(3)
    expect(sc.byAgent[1].agent).toBe('formiga-b')
    expect(sc.byAgent[1].doneTasks).toBe(1)
  })

  it('byAgent leadTimeHours is numeric for each agent', () => {
    const store = freshStore()
    seedTask(store, { id: 't1', claimedBy: 'formiga-a' })
    seedTask(store, { id: 't2', claimedBy: 'formiga-b' })

    const sc = collectVelocityScorecard(store)

    for (const entry of sc.byAgent) {
      expect(typeof entry.leadTimeHours).toBe('number')
      expect(entry.leadTimeHours).toBeGreaterThanOrEqual(0)
    }
  })

  it('byAgent tokensPerTask is numeric (ledger may be empty)', () => {
    const store = freshStore()
    seedTask(store, { id: 't1', claimedBy: 'formiga-a' })

    const sc = collectVelocityScorecard(store)

    for (const entry of sc.byAgent) {
      expect(typeof entry.tokensPerTask).toBe('number')
      expect(entry.tokensPerTask).toBeGreaterThanOrEqual(0)
    }
  })
})

// ── AC2: done sem claimedBy → '(unattributed)'; sum matches global ─────────

describe('AC2: unattributed tasks and global sum', () => {
  it('uses "(unattributed)" for nodes without claimedBy', () => {
    const store = freshStore()
    seedTask(store, { id: 't1', claimedBy: 'formiga-a' })
    seedTask(store, { id: 't2' })

    const sc = collectVelocityScorecard(store)

    expect(sc.byAgent).toHaveLength(2)
    const unatt = sc.byAgent.find((a) => a.agent === '(unattributed)')
    expect(unatt).toBeDefined()
    expect(unatt!.doneTasks).toBe(1)
  })

  it('sum of byAgent.doneTasks equals global doneTasks', () => {
    const store = freshStore()
    seedTask(store, { id: 't1', claimedBy: 'formiga-a' })
    seedTask(store, { id: 't2', claimedBy: 'formiga-b' })
    seedTask(store, { id: 't3', claimedBy: 'formiga-b' })
    seedTask(store, { id: 't4' })

    const sc = collectVelocityScorecard(store)

    const summed = sc.byAgent.reduce((s, a) => s + a.doneTasks, 0)
    expect(summed).toBe(sc.doneTasks)
  })

  it('mixed attributed+unattributed with ledger tokens', () => {
    const store = freshStore()
    const db = store.getDb()

    seedTask(store, { id: 't1', claimedBy: 'formiga-a' })
    seedTask(store, { id: 't2' })
    seedLedger(db, 't1', 1000)
    seedLedger(db, 't2', 500)

    const sc = collectVelocityScorecard(store)

    const a = sc.byAgent.find((e) => e.agent === 'formiga-a')
    const u = sc.byAgent.find((e) => e.agent === '(unattributed)')
    expect(a).toBeDefined()
    expect(u).toBeDefined()
    // each has positive tokens
    expect(a!.tokensPerTask).toBeGreaterThan(0)
    expect(u!.tokensPerTask).toBeGreaterThan(0)
  })
})

// ── AC3: sem done → byAgent [] + 8 dims zero + note, sem throw ────────────

describe('AC3: no done nodes', () => {
  it('byAgent is empty when no tasks done', () => {
    const store = freshStore()
    const sc = collectVelocityScorecard(store)

    expect(sc.byAgent).toEqual([])
  })

  it('global metrics are zeros with note when no done tasks', () => {
    const store = freshStore()

    // insert some non-done tasks so stats have nodes but no done
    seedTask(store, { id: 't1', claimedBy: 'formiga-a', status: 'in_progress' })

    const sc = collectVelocityScorecard(store)

    expect(sc.doneTasks).toBe(0)
    expect(sc.leadTimeHours).toBe(0)
    expect(sc.cycleTimeHours).toBe(0)
    expect(sc.costPerTaskUsd).toBe(0)
    expect(sc.tokensPerTask).toBe(0)
    expect(sc.note).toBeDefined()
    expect(sc.note).toContain('sem tasks done')
  })

  it('computeVelocityScorecard pure: empty byAgent does not throw', () => {
    const inputs = {
      doneTasks: 0,
      leadTimeP50Hours: 0,
      avgCompletionHours: 0,
      active: 0,
      waiting: 0,
      fpyValue: null,
      changeFailureRate: 0,
      gateOutcomes: { passed: 0, total: 0 },
      ledgerTotals: { costUsd: 0, tokens: 0 },
      byAgent: [],
    }

    const sc = computeVelocityScorecard(inputs)
    expect(sc.byAgent).toEqual([])
    expect(sc.doneTasks).toBe(0)
    expect(sc.note).toBeDefined()
  })
})

// ── AC4: `agf metrics` envelope must contain data.velocity.byAgent ─────────

describe('AC4: velocity envelope includes byAgent', () => {
  it('collectVelocityScorecard returns byAgent on the VelocityScorecard', () => {
    const store = freshStore()
    seedTask(store, { id: 't1', claimedBy: 'formiga-a' })

    const sc = collectVelocityScorecard(store)

    expect(sc).toHaveProperty('byAgent')
    expect(Array.isArray(sc.byAgent)).toBe(true)
  })

  it('byAgent is present even with zero done tasks', () => {
    const store = freshStore()

    const sc = collectVelocityScorecard(store)

    expect(sc).toHaveProperty('byAgent')
    expect(sc.byAgent).toEqual([])
  })
})
