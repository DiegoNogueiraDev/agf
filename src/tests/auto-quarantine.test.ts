/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Task node_6ada93b97866 AC coverage: auto-quarantine.ts
 *
 * AC: agf check <id> registra falha em events com kind=dod_fail
 * AC: >=3 dod_fail consecutivos dispara sugestão quarantine
 * AC: agf heal --apply auto-quarentena nós com >=5 dod_fail
 * AC: testes: contagem consecutiva, reset em done
 */

import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  recordDodFail,
  recordDodDone,
  getConsecutiveDodFailCount,
  autoQuarantineNodes,
} from '../core/colony/auto-quarantine.js'

function makeDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE events (
      id              TEXT PRIMARY KEY,
      kind            TEXT NOT NULL,
      subjectRef_kind TEXT NOT NULL,
      subjectRef_id   TEXT NOT NULL,
      payload         TEXT,
      timestamp       TEXT NOT NULL,
      projectId       TEXT,
      sessionId       TEXT,
      durationMs      REAL,
      parentEventId   TEXT
    );
    CREATE INDEX idx_events_subject ON events(subjectRef_kind, subjectRef_id);
    CREATE INDEX idx_events_kind ON events(kind);

    CREATE TABLE nodes (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL DEFAULT '',
      status     TEXT NOT NULL DEFAULT 'backlog',
      type       TEXT NOT NULL DEFAULT 'task',
      priority   INTEGER NOT NULL DEFAULT 3,
      project_id TEXT NOT NULL DEFAULT 'proj1',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  return db
}

function insertNode(db: Database.Database, id: string, status = 'in_progress') {
  db.prepare(`INSERT INTO nodes (id, title, status) VALUES (?, ?, ?)`).run(id, `Node ${id}`, status)
}

// ── recordDodFail ─────────────────────────────────────────────────────────────

describe('recordDodFail', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeDb()
  })

  it('inserts a dod_fail event into the events table', () => {
    recordDodFail(db, 'node_abc', 'proj1')
    const row = db.prepare(`SELECT * FROM events WHERE kind = 'dod_fail'`).get() as
      { subjectRef_id: string } | undefined
    expect(row).toBeDefined()
    expect(row!.subjectRef_id).toBe('node_abc')
  })

  it('inserts multiple failures for the same node', () => {
    recordDodFail(db, 'node_abc', 'proj1')
    recordDodFail(db, 'node_abc', 'proj1')
    recordDodFail(db, 'node_abc', 'proj1')
    const count = (
      db.prepare(`SELECT COUNT(*) as c FROM events WHERE kind='dod_fail' AND subjectRef_id='node_abc'`).get() as {
        c: number
      }
    ).c
    expect(count).toBe(3)
  })
})

// ── recordDodDone ─────────────────────────────────────────────────────────────

describe('recordDodDone', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeDb()
  })

  it('inserts a dod_done event into the events table', () => {
    recordDodDone(db, 'node_abc', 'proj1')
    const row = db.prepare(`SELECT * FROM events WHERE kind = 'dod_done'`).get() as
      { subjectRef_id: string } | undefined
    expect(row).toBeDefined()
    expect(row!.subjectRef_id).toBe('node_abc')
  })
})

// ── getConsecutiveDodFailCount ────────────────────────────────────────────────

describe('getConsecutiveDodFailCount', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeDb()
  })

  it('returns 0 when no events exist', () => {
    expect(getConsecutiveDodFailCount(db, 'node_abc')).toBe(0)
  })

  it('counts all failures when no done event exists', () => {
    recordDodFail(db, 'node_abc', 'proj1')
    recordDodFail(db, 'node_abc', 'proj1')
    expect(getConsecutiveDodFailCount(db, 'node_abc')).toBe(2)
  })

  it('resets count after a done event', () => {
    recordDodFail(db, 'node_abc', 'proj1')
    recordDodFail(db, 'node_abc', 'proj1')
    recordDodDone(db, 'node_abc', 'proj1')
    recordDodFail(db, 'node_abc', 'proj1')
    expect(getConsecutiveDodFailCount(db, 'node_abc')).toBe(1)
  })

  it('returns 0 when last event is done', () => {
    recordDodFail(db, 'node_abc', 'proj1')
    recordDodDone(db, 'node_abc', 'proj1')
    expect(getConsecutiveDodFailCount(db, 'node_abc')).toBe(0)
  })

  it('counts failures for a different node independently', () => {
    recordDodFail(db, 'node_abc', 'proj1')
    recordDodFail(db, 'node_abc', 'proj1')
    recordDodFail(db, 'node_xyz', 'proj1')
    expect(getConsecutiveDodFailCount(db, 'node_abc')).toBe(2)
    expect(getConsecutiveDodFailCount(db, 'node_xyz')).toBe(1)
  })

  it('counts 3 consecutive failures (quarantine suggestion threshold)', () => {
    recordDodFail(db, 'node_abc', 'proj1')
    recordDodFail(db, 'node_abc', 'proj1')
    recordDodFail(db, 'node_abc', 'proj1')
    expect(getConsecutiveDodFailCount(db, 'node_abc')).toBeGreaterThanOrEqual(3)
  })
})

// ── autoQuarantineNodes ───────────────────────────────────────────────────────

describe('autoQuarantineNodes', () => {
  let db: Database.Database

  beforeEach(() => {
    db = makeDb()
  })

  it('quarantines nodes with >= 5 consecutive failures', () => {
    insertNode(db, 'node_abc')
    for (let i = 0; i < 5; i++) recordDodFail(db, 'node_abc', 'proj1')

    const result = autoQuarantineNodes(db, 'proj1', 5)
    expect(result.quarantined).toContain('node_abc')
  })

  it('does not quarantine nodes with fewer than threshold failures', () => {
    insertNode(db, 'node_abc')
    for (let i = 0; i < 4; i++) recordDodFail(db, 'node_abc', 'proj1')

    const result = autoQuarantineNodes(db, 'proj1', 5)
    expect(result.quarantined).not.toContain('node_abc')
  })

  it('updates node status to quarantined in nodes table', () => {
    insertNode(db, 'node_abc')
    for (let i = 0; i < 5; i++) recordDodFail(db, 'node_abc', 'proj1')

    autoQuarantineNodes(db, 'proj1', 5)

    const node = db.prepare(`SELECT status FROM nodes WHERE id = ?`).get('node_abc') as { status: string }
    expect(node.status).toBe('quarantined')
  })

  it('returns count of quarantined nodes', () => {
    insertNode(db, 'node_a')
    insertNode(db, 'node_b')
    for (let i = 0; i < 5; i++) {
      recordDodFail(db, 'node_a', 'proj1')
      recordDodFail(db, 'node_b', 'proj1')
    }
    const result = autoQuarantineNodes(db, 'proj1', 5)
    expect(result.count).toBe(2)
  })

  it('skips already-quarantined and done nodes', () => {
    insertNode(db, 'node_done', 'done')
    for (let i = 0; i < 5; i++) recordDodFail(db, 'node_done', 'proj1')

    const result = autoQuarantineNodes(db, 'proj1', 5)
    expect(result.quarantined).not.toContain('node_done')
  })

  it('resets consecutive count via done event — not quarantined after reset below threshold', () => {
    insertNode(db, 'node_abc')
    for (let i = 0; i < 5; i++) recordDodFail(db, 'node_abc', 'proj1')
    // done resets
    recordDodDone(db, 'node_abc', 'proj1')
    // only 3 new failures — below threshold
    for (let i = 0; i < 3; i++) recordDodFail(db, 'node_abc', 'proj1')

    const result = autoQuarantineNodes(db, 'proj1', 5)
    expect(result.quarantined).not.toContain('node_abc')
  })
})
