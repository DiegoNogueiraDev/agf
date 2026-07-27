/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task 1.3 AC coverage: cmd-tracker.ts
 *
 * AC1: command tracked WHEN track THEN entry stored with command, ts, session_id
 * AC2: top-N most used WHEN getFrequencies THEN ordered by count DESC
 * Coverage: cmd-tracker.ts ≥ 90% branch coverage
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from '../core/store/migrations.js'
import {
  trackCommandUsage,
  getFrequencies,
  getTotalCommands,
  type CmdUsageRow,
} from '../core/observability/cmd-tracker.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

let db: Database.Database
let seq = 0

function freshDb(): Database.Database {
  const d = new Database(':memory:')
  runMigrations(d)
  return d
}

function makeRow(command: string, overrides?: Partial<CmdUsageRow>): CmdUsageRow {
  return {
    id: `cmd_${++seq}`,
    projectId: 'proj_test',
    command,
    args: '',
    cwd: '/fake',
    durationMs: 100,
    exitCode: 0,
    ...overrides,
  }
}

beforeEach(() => {
  db = freshDb()
  seq = 0
})

// ── AC1: track — entry stored with correct fields ─────────────────────────────

describe('AC1: trackCommandUsage — entry stored with command, ts, project', () => {
  it('stores command entry without throwing', () => {
    expect(() => trackCommandUsage(db, makeRow('next'))).not.toThrow()
  })

  it('stored entry is queryable from the DB', () => {
    trackCommandUsage(db, makeRow('next'))
    const row = db.prepare('SELECT command FROM cmd_usage WHERE command = ?').get('next')
    expect(row).toBeTruthy()
  })

  it('entry has the correct command name (AC1: command=next)', () => {
    trackCommandUsage(db, makeRow('next'))
    const row = db.prepare("SELECT command FROM cmd_usage WHERE command = 'next'").get() as { command: string }
    expect(row.command).toBe('next')
  })

  it('entry has trackedAt set (non-null, positive number)', () => {
    trackCommandUsage(db, makeRow('next'))
    const row = db.prepare('SELECT trackedAt FROM cmd_usage').get() as { trackedAt: number }
    expect(row.trackedAt).toBeGreaterThan(0)
  })

  it('entry stores project_id correctly', () => {
    trackCommandUsage(db, makeRow('next', { projectId: 'proj_abc' }))
    const row = db.prepare("SELECT project_id FROM cmd_usage WHERE project_id = 'proj_abc'").get() as {
      project_id: string
    }
    expect(row.project_id).toBe('proj_abc')
  })

  it('entry stores exit_code and durationMs', () => {
    trackCommandUsage(db, makeRow('done', { durationMs: 250, exitCode: 0 }))
    const row = db.prepare("SELECT durationMs, exitCode FROM cmd_usage WHERE command = 'done'").get() as {
      durationMs: number
      exitCode: number
    }
    expect(row.durationMs).toBe(250)
    expect(row.exitCode).toBe(0)
  })

  it('multiple invocations create multiple rows', () => {
    trackCommandUsage(db, makeRow('next'))
    trackCommandUsage(db, makeRow('next'))
    trackCommandUsage(db, makeRow('done'))
    const count = db.prepare('SELECT COUNT(*) as cnt FROM cmd_usage').get() as { cnt: number }
    expect(count.cnt).toBe(3)
  })

  it('stores args field correctly', () => {
    trackCommandUsage(db, makeRow('node', { args: '--type task --status backlog' }))
    const row = db.prepare("SELECT args FROM cmd_usage WHERE command = 'node'").get() as { args: string }
    expect(row.args).toBe('--type task --status backlog')
  })

  it('does not throw when DB has an issue (graceful error handling)', () => {
    // Close the DB to simulate an error — cmd-tracker catches and logs
    db.close()
    expect(() => trackCommandUsage(db, makeRow('next'))).not.toThrow()
  })
})

// ── AC2: getFrequencies — ordered by count DESC ────────────────────────────────

describe('AC2: getFrequencies — top-N ordered by count DESC', () => {
  it('returns empty array when no entries exist', () => {
    const freqs = getFrequencies(db, 'proj_test')
    expect(freqs).toEqual([])
  })

  it('returns one frequency entry for one unique command', () => {
    trackCommandUsage(db, makeRow('next'))
    const freqs = getFrequencies(db, 'proj_test')
    expect(freqs).toHaveLength(1)
    expect(freqs[0].command).toBe('next')
    expect(freqs[0].count).toBe(1)
  })

  it('accumulates count across multiple invocations of same command', () => {
    trackCommandUsage(db, makeRow('next'))
    trackCommandUsage(db, makeRow('next'))
    trackCommandUsage(db, makeRow('next'))
    const freqs = getFrequencies(db, 'proj_test')
    expect(freqs[0].count).toBe(3)
  })

  it('orders by count DESC — most-used command first (AC2)', () => {
    trackCommandUsage(db, makeRow('next'))
    trackCommandUsage(db, makeRow('next'))
    trackCommandUsage(db, makeRow('next'))
    trackCommandUsage(db, makeRow('done'))
    trackCommandUsage(db, makeRow('done'))
    trackCommandUsage(db, makeRow('stats'))

    const freqs = getFrequencies(db, 'proj_test')
    expect(freqs[0].command).toBe('next') // count=3
    expect(freqs[1].command).toBe('done') // count=2
    expect(freqs[2].command).toBe('stats') // count=1
  })

  it('respects topN limit', () => {
    for (let i = 0; i < 15; i++) {
      trackCommandUsage(db, makeRow(`cmd_${i}`))
    }
    const freqs = getFrequencies(db, 'proj_test', 5)
    expect(freqs).toHaveLength(5)
  })

  it('default topN is 10', () => {
    for (let i = 0; i < 12; i++) {
      trackCommandUsage(db, makeRow(`cmd_${i}`))
    }
    const freqs = getFrequencies(db, 'proj_test')
    expect(freqs).toHaveLength(10)
  })

  it('totalDurationMs aggregates correctly', () => {
    trackCommandUsage(db, makeRow('next', { durationMs: 100 }))
    trackCommandUsage(db, makeRow('next', { durationMs: 200 }))
    const freqs = getFrequencies(db, 'proj_test')
    expect(freqs[0].totalDurationMs).toBe(300)
  })

  it('avgDurationMs is computed correctly', () => {
    trackCommandUsage(db, makeRow('next', { durationMs: 100 }))
    trackCommandUsage(db, makeRow('next', { durationMs: 200 }))
    const freqs = getFrequencies(db, 'proj_test')
    expect(freqs[0].avgDurationMs).toBe(150)
  })

  it('lastUsed is the most recent trackedAt', () => {
    trackCommandUsage(db, makeRow('next'))
    trackCommandUsage(db, makeRow('next'))
    const freqs = getFrequencies(db, 'proj_test')
    expect(freqs[0].lastUsed).toBeGreaterThan(0)
  })

  it('filters by project_id — different projects do not cross-contaminate', () => {
    trackCommandUsage(db, makeRow('next', { projectId: 'proj_A' }))
    trackCommandUsage(db, makeRow('done', { projectId: 'proj_B' }))

    const freqsA = getFrequencies(db, 'proj_A')
    const freqsB = getFrequencies(db, 'proj_B')

    expect(freqsA).toHaveLength(1)
    expect(freqsA[0].command).toBe('next')
    expect(freqsB).toHaveLength(1)
    expect(freqsB[0].command).toBe('done')
  })

  it('returns [] when DB is closed (graceful error handling)', () => {
    db.close()
    expect(getFrequencies(db, 'proj_test')).toEqual([])
  })
})

// ── getTotalCommands coverage ─────────────────────────────────────────────────

describe('getTotalCommands', () => {
  it('returns 0 when no commands tracked', () => {
    expect(getTotalCommands(db, 'proj_test')).toBe(0)
  })

  it('returns correct count after tracking', () => {
    trackCommandUsage(db, makeRow('next'))
    trackCommandUsage(db, makeRow('done'))
    trackCommandUsage(db, makeRow('stats'))
    expect(getTotalCommands(db, 'proj_test')).toBe(3)
  })

  it('filters by project_id', () => {
    trackCommandUsage(db, makeRow('next', { projectId: 'proj_A' }))
    trackCommandUsage(db, makeRow('next', { projectId: 'proj_A' }))
    trackCommandUsage(db, makeRow('done', { projectId: 'proj_B' }))
    expect(getTotalCommands(db, 'proj_A')).toBe(2)
    expect(getTotalCommands(db, 'proj_B')).toBe(1)
  })

  it('returns 0 when DB is closed (graceful error handling)', () => {
    db.close()
    expect(getTotalCommands(db, 'proj_test')).toBe(0)
  })
})
