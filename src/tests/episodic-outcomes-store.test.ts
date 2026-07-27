/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { configureDb, runMigrations } from '../core/store/migrations.js'
import {
  buildTaskType,
  computeOutcome,
  buildApproachSummary,
  insertEpisodicOutcome,
  queryEpisodicOutcomes,
} from '../core/store/episodic-outcomes-store.js'
import type { EpisodicOutcome } from '../core/store/episodic-outcomes-store.js'

function createDb(): Database.Database {
  const db = new Database(':memory:')
  configureDb(db)
  runMigrations(db)
  return db
}

describe('buildTaskType', () => {
  it('returns empty string for undefined/empty tags', () => {
    expect(buildTaskType(undefined)).toBe('')
    expect(buildTaskType([])).toBe('')
  })

  it('sorts and normalizes tags', () => {
    expect(buildTaskType(['Security', 'AUTH', 'security'])).toBe('auth,security')
  })

  it('joins unique sorted tags with comma', () => {
    expect(buildTaskType(['z', 'a', 'm'])).toBe('a,m,z')
  })
})

describe('computeOutcome', () => {
  it('returns "success" for reopenCount 0', () => {
    expect(computeOutcome(0)).toBe('success')
  })

  it('returns "partial" for reopenCount 1', () => {
    expect(computeOutcome(1)).toBe('partial')
  })

  it('returns "failure" for reopenCount > 1', () => {
    expect(computeOutcome(2)).toBe('failure')
    expect(computeOutcome(5)).toBe('failure')
  })
})

describe('buildApproachSummary', () => {
  it('formats digest as sorted files + sorted ACs', () => {
    const summary = buildApproachSummary(['b.ts', 'a.ts'], ['ac3', 'ac1'])
    expect(summary).toBe('a.ts+b.ts:ac1,ac3')
  })

  it('handles empty arrays', () => {
    expect(buildApproachSummary([], [])).toBe(':')
  })
})

describe('insertEpisodicOutcome', () => {
  let db: Database.Database

  const sampleOutcome: EpisodicOutcome = {
    id: 'eo_1',
    nodeId: 'node_1',
    taskType: 'bugfix,security',
    tags: 'security,bugfix',
    approachSummary: 'src/a.ts:ac1',
    outcome: 'success',
    cycleTimeDelta: 120,
    reopenCount: 0,
    createdAt: Date.now(),
  }

  beforeEach(() => {
    db = createDb()
  })

  it('inserts an outcome record', () => {
    insertEpisodicOutcome(db, sampleOutcome)
    const row = db.prepare('SELECT * FROM episodic_outcomes WHERE id = ?').get('eo_1') as Record<string, unknown>
    expect(row).toBeTruthy()
    expect(row.node_id).toBe('node_1')
    expect(row.outcome).toBe('success')
  })

  it('uses INSERT OR IGNORE for duplicate id', () => {
    insertEpisodicOutcome(db, sampleOutcome)
    const modified = { ...sampleOutcome, cycleTimeDelta: 999 }
    insertEpisodicOutcome(db, modified)
    const row = db.prepare('SELECT cycle_time_delta FROM episodic_outcomes WHERE id = ?').get('eo_1') as {
      cycle_time_delta: number
    }
    expect(row.cycle_time_delta).toBe(120)
  })
})

describe('queryEpisodicOutcomes', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createDb()
    const outcomes: EpisodicOutcome[] = [
      {
        id: 'eo_1',
        nodeId: 'n1',
        taskType: 'bugfix',
        tags: '',
        approachSummary: 'a',
        outcome: 'success',
        cycleTimeDelta: 10,
        reopenCount: 0,
        createdAt: 1000,
      },
      {
        id: 'eo_2',
        nodeId: 'n2',
        taskType: 'security',
        tags: '',
        approachSummary: 'b',
        outcome: 'failure',
        cycleTimeDelta: 50,
        reopenCount: 3,
        createdAt: 2000,
      },
      {
        id: 'eo_3',
        nodeId: 'n3',
        taskType: 'bugfix',
        tags: '',
        approachSummary: 'c',
        outcome: 'partial',
        cycleTimeDelta: 30,
        reopenCount: 1,
        createdAt: 1500,
      },
    ]
    for (const o of outcomes) {
      insertEpisodicOutcome(db, o)
    }
  })

  it('returns all outcomes ordered by created_at DESC with default limit 100', () => {
    const results = queryEpisodicOutcomes(db)
    expect(results).toHaveLength(3)
    expect(results[0].id).toBe('eo_2')
    expect(results[1].id).toBe('eo_3')
    expect(results[2].id).toBe('eo_1')
  })

  it('filters by taskType', () => {
    const results = queryEpisodicOutcomes(db, { taskType: 'security' })
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('eo_2')
  })

  it('filters by maxAgeDays', () => {
    const results = queryEpisodicOutcomes(db, { maxAgeDays: 0 })
    expect(results).toHaveLength(3)
  })

  it('respects limit', () => {
    const results = queryEpisodicOutcomes(db, { limit: 1 })
    expect(results).toHaveLength(1)
  })

  it('returns empty array when no matches', () => {
    const results = queryEpisodicOutcomes(db, { taskType: 'nonexistent' })
    expect(results).toEqual([])
  })
})
